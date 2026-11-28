#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fetch an English blog URL and save Markdown under <domain>/<slug>.md.

Windows-compatible (stdlib only). Exit non-zero on failure with clear stderr.

SSRF policy: only public https:// URLs. Blocks loopback, RFC1918, link-local,
cloud metadata, and re-validates every redirect hop.
"""
from __future__ import annotations

import ipaddress
import json
import re
import socket
import sys
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse


# Hostnames that must never be fetched (cloud metadata / internal DNS).
_BLOCKED_HOSTS = {
    "localhost",
    "metadata.google.internal",
    "metadata.google",
    "kubernetes.default",
    "kubernetes.default.svc",
}


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._chunks: list[str] = []
        self._skip = 0
        self.title = ""
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "noscript"}:
            self._skip += 1
        if tag == "title":
            self._in_title = True
        if tag in {"p", "br", "div", "h1", "h2", "h3", "h4", "li", "tr"}:
            self._chunks.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript"} and self._skip:
            self._skip -= 1
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._skip:
            return
        text = data.strip()
        if not text:
            return
        if self._in_title and not self.title:
            self.title = text
        self._chunks.append(text + " ")

    def text(self) -> str:
        raw = "".join(self._chunks)
        raw = re.sub(r"[ \t]+", " ", raw)
        raw = re.sub(r"\n{3,}", "\n\n", raw)
        return raw.strip()


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9\u4e00-\u9fff._-]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or "post"


def domain_of(url: str) -> str:
    host = urlparse(url).hostname or "unknown"
    if host.startswith("www."):
        host = host[4:]
    return host


def path_slug(url: str) -> str:
    path = urlparse(url).path or "/"
    part = path.rstrip("/").split("/")[-1] or "index"
    part = re.sub(r"\.(html?|php|aspx)$", "", part, flags=re.I)
    return slugify(part)


def html_to_markdown(url: str, html: str) -> str:
    parser = _TextExtractor()
    try:
        parser.feed(html)
    except Exception:
        pass
    title = parser.title or path_slug(url)
    body = parser.text()
    if not body:
        body = "(未能从 HTML 提取正文，请检查 URL 或站点反爬限制。)"
    return f"# {title}\n\nSource: {url}\n\n{body}\n"


def _is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
        or (ip.version == 4 and ip in ipaddress.ip_network("169.254.0.0/16"))
        or (ip.version == 6 and ip in ipaddress.ip_network("fc00::/7"))
    )


def assert_public_https_url(url: str) -> str:
    """Raise ValueError unless url is https to a public internet host."""
    raw = (url or "").strip()
    parsed = urlparse(raw)
    if parsed.scheme.lower() != "https":
        raise ValueError("仅允许 https:// 公网 URL（已拒绝 http 与其它协议）")
    if parsed.username or parsed.password:
        raise ValueError("URL 不得包含用户名或密码")
    host = parsed.hostname
    if not host:
        raise ValueError("URL 缺少主机名")
    host_l = host.lower().rstrip(".")
    if host_l in _BLOCKED_HOSTS or host_l.endswith(".localhost") or host_l.endswith(".local"):
        raise ValueError(f"禁止访问内部主机：{host}")
    if parsed.port not in (None, 443):
        raise ValueError("仅允许 HTTPS 默认端口 443")

    # Literal IP in the URL
    try:
        ip = ipaddress.ip_address(host_l)
        if _is_blocked_ip(ip):
            raise ValueError(f"禁止访问私有/元数据地址：{host}")
        return raw
    except ValueError as e:
        if "禁止访问" in str(e):
            raise
        # not a literal IP — resolve DNS
        pass

    try:
        infos = socket.getaddrinfo(host_l, 443, type=socket.SOCK_STREAM)
    except socket.gaierror as e:
        raise ValueError(f"无法解析主机名：{host} ({e})") from e
    if not infos:
        raise ValueError(f"无法解析主机名：{host}")
    for info in infos:
        ip_str = info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        if _is_blocked_ip(ip):
            raise ValueError(
                f"主机 {host} 解析到私有/元数据地址（{ip}），已拒绝（防 SSRF）"
            )
    return raw


class _SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Re-validate every redirect target against the public-https policy."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        assert_public_https_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(
            "用法: python fetch_blog.py <URL>\n"
            "示例: python .cursor/skills/english-blog-translate/scripts/fetch_blog.py "
            '"https://waitbutwhy.com/2023/05/baby.html"',
            file=sys.stderr,
        )
        return 2

    url = argv[1].strip()
    try:
        url = assert_public_https_url(url)
    except ValueError as e:
        print(f"错误: {e} — {url}", file=sys.stderr)
        return 2

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "SkillLabBlogFetch/1.0 (+educational; stdlib urllib)",
            "Accept": "text/html,application/xhtml+xml",
        },
        method="GET",
    )
    opener = urllib.request.build_opener(_SafeRedirectHandler)

    try:
        with opener.open(req, timeout=45) as resp:
            charset = resp.headers.get_content_charset() or "utf-8"
            html = resp.read().decode(charset, errors="replace")
            final_url = resp.geturl() or url
            # Defense in depth: final URL after redirects must still be public https.
            assert_public_https_url(final_url)
    except ValueError as e:
        print(f"错误: {e}", file=sys.stderr)
        return 2
    except urllib.error.HTTPError as e:
        print(f"抓取失败 HTTP {e.code}: {e.reason} — {url}", file=sys.stderr)
        return 1
    except urllib.error.URLError as e:
        print(f"抓取失败（网络/URL）：{e.reason} — {url}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"抓取失败：{e} — {url}", file=sys.stderr)
        return 1

    domain = domain_of(final_url)
    slug = path_slug(final_url)
    out_dir = Path.cwd() / domain
    out_dir.mkdir(parents=True, exist_ok=True)
    md_path = out_dir / f"{slug}.md"
    md_path.write_text(html_to_markdown(final_url, html), encoding="utf-8")

    payload = {
        "ok": True,
        "url": final_url,
        "domain": domain,
        "slug": slug,
        "markdown_path": str(md_path).replace("\\", "/"),
        "zh_path": str(out_dir / f"中译-{slug}.md").replace("\\", "/"),
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
