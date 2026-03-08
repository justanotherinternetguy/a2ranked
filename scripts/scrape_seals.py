#!/usr/bin/env python3
import requests
from bs4 import BeautifulSoup
import time
import re
import os
import sys
import urllib.parse
import csv

USER_AGENT = 'seallist-scraper/1.0 (+https://github.com/Copilot)'
session = requests.Session()
session.headers.update({'User-Agent': USER_AGENT})

INPUT_FILE = 'universities.txt'
OUTPUT_DIR = 'seals'
LOG_CSV = os.path.join(OUTPUT_DIR, 'downloads.csv')


def read_universities():
    if not os.path.exists(INPUT_FILE):
        print(f"ERROR: {INPUT_FILE} not found", file=sys.stderr)
        sys.exit(1)
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        lines = [l.strip() for l in f if l.strip()]
    return lines


def search_wikipedia(query):
    api = 'https://en.wikipedia.org/w/api.php'
    params = {'action':'query','list':'search','srsearch':query,'format':'json','srlimit':1}
    try:
        r = session.get(api, params=params, timeout=30)
        r.raise_for_status()
        data = r.json()
        hits = data.get('query', {}).get('search', [])
        if hits:
            return hits[0]['title']
        else:
            return None
    except Exception as e:
        print(f"SEARCH ERROR for {query}: {e}", file=sys.stderr)
        return None


def fetch_url(url):
    try:
        r = session.get(url, timeout=30)
        r.raise_for_status()
        return r.text
    except Exception as e:
        print(f"FETCH ERROR {url}: {e}", file=sys.stderr)
        return None


def parse_infobox_images(html, page_url):
    soup = BeautifulSoup(html, 'lxml')
    infobox = soup.find('table', class_=lambda c: c and 'infobox' in c)
    candidates = []
    if infobox:
        anchors = infobox.find_all('a', href=re.compile('^/wiki/File:'))
        for a in anchors:
            href = a.get('href')
            file_page = urllib.parse.urljoin('https://en.wikipedia.org', href)
            img = a.find('img')
            alt = img.get('alt') if img else ''
            src = img.get('src') if img else ''
            caption = ''
            tr = a.find_parent(['tr','td'])
            if tr:
                figcaption = tr.find('div', class_='infobox-caption') or tr.find('div', class_='pi-caption') or tr.find('i')
                if figcaption:
                    caption = figcaption.get_text(strip=True)
            candidates.append({'file_page': file_page, 'alt': alt, 'src': src, 'caption': caption})
    else:
        soup2 = soup
        anchors = soup2.find_all('a', href=re.compile('^/wiki/File:'), limit=3)
        for a in anchors:
            href = a.get('href')
            file_page = urllib.parse.urljoin('https://en.wikipedia.org', href)
            img = a.find('img')
            alt = img.get('alt') if img else ''
            src = img.get('src') if img else ''
            candidates.append({'file_page': file_page, 'alt': alt, 'src': src, 'caption': ''})
    return candidates


def fetch_file_info(file_page_url):
    html = fetch_url(file_page_url)
    if not html:
        return None, None
    fsoup = BeautifulSoup(html, 'lxml')
    orig_url = None
    full = fsoup.find('div', class_='fullImageLink')
    if full:
        a = full.find('a', href=True)
        if a:
            orig_url = a['href']
    if not orig_url:
        for a in fsoup.find_all('a', href=True):
            href = a['href']
            if href.startswith('//upload.wikimedia.org') or href.startswith('https://upload.wikimedia.org'):
                orig_url = href
                break
    if orig_url and orig_url.startswith('//'):
        orig_url = 'https:' + orig_url
    license_text = ''
    lic = fsoup.find(class_=re.compile('licensetpl', re.I))
    if lic:
        license_text = lic.get_text(" ", strip=True)
    else:
        info = fsoup.find(id='fileinfotpl') or fsoup.find('table', class_=re.compile('fileInfo', re.I))
        if info:
            license_text = info.get_text(" ", strip=True)
        else:
            for tag in fsoup.find_all(['div','p','td','span']):
                txt = tag.get_text(" ", strip=True)
                if 'license' in txt.lower():
                    license_text = txt
                    break
    return orig_url, license_text


def sanitize(s):
    return re.sub(r'[\\/*?:"<>|]', '_', s).strip()


def choose_best(candidates):
    if not candidates:
        return None
    best = None
    best_score = -999
    KEYWORDS = ['seal','coat','emblem','arms','crest','coat_of_arms','logo']
    for c in candidates:
        score = 0
        alt = (c.get('alt') or '') + ' ' + (c.get('caption') or '') + ' ' + (c.get('file_page') or '')
        alt_l = alt.lower()
        if any(k in alt_l for k in ['coat of arms','coat_of_arms']):
            score += 30
        if any(k in alt_l for k in KEYWORDS):
            score += 10
        if c.get('orig_url'):
            u = c['orig_url'].lower()
            if u.endswith('.svg'):
                score += 5
            if '.png' in u:
                score += 2
            if '.jpg' in u or '.jpeg' in u:
                score += 1
        if score > best_score:
            best_score = score
            best = c
    if best is None:
        best = candidates[0]
    return best


def download_file(url, out_path):
    try:
        r = session.get(url, stream=True, timeout=60)
        r.raise_for_status()
        with open(out_path, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        return True
    except Exception as e:
        print(f"DOWNLOAD ERROR {url}: {e}", file=sys.stderr)
        return False


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    unis = read_universities()
    rows = []
    for uni in unis:
        print("Processing:", uni)
        title = search_wikipedia(uni)
        time.sleep(1)
        if not title:
            print(f"  No Wikipedia search result for '{uni}', trying direct title.")
            title = uni
        page_url = 'https://en.wikipedia.org/wiki/' + urllib.parse.quote(title.replace(' ', '_'))
        page_html = fetch_url(page_url)
        time.sleep(1)
        if not page_html:
            print(f"  Failed to fetch page for '{uni}' ({title})", file=sys.stderr)
            rows.append([uni, title, '', '', '', 'fetch_page_failed'])
            continue
        candidates = parse_infobox_images(page_html, page_url)
        if not candidates:
            print(f"  No infobox images found for '{uni}'", file=sys.stderr)
            rows.append([uni, title, page_url, '', '', 'no_infobox_images'])
            continue
        for c in candidates:
            fp = c.get('file_page')
            if not fp:
                continue
            orig, lic = fetch_file_info(fp)
            c['orig_url'] = orig
            c['license'] = lic
            time.sleep(1)
        candidates = [c for c in candidates if c.get('orig_url')]
        if not candidates:
            print(f"  No downloadable originals found for '{uni}'", file=sys.stderr)
            rows.append([uni, title, page_url, '', '', 'no_original_found'])
            continue
        best = choose_best(candidates)
        if not best:
            print(f"  No best candidate for '{uni}'", file=sys.stderr)
            rows.append([uni, title, page_url, '', '', 'no_best_candidate'])
            continue
        orig_url = best.get('orig_url')
        license_text = best.get('license') or ''
        parsed = urllib.parse.urlparse(orig_url)
        filename = os.path.basename(parsed.path)
        ext = os.path.splitext(filename)[1] or ''
        out_name = sanitize(uni) + ext
        out_path = os.path.join(OUTPUT_DIR, out_name)
        success = download_file(orig_url, out_path)
        if success:
            print(f"  Downloaded: {out_path} from {orig_url}")
            rows.append([uni, title, page_url, best.get('file_page'), orig_url, filename, license_text, out_path])
        else:
            print(f"  Download failed for {orig_url}", file=sys.stderr)
            rows.append([uni, title, page_url, best.get('file_page'), orig_url, filename, 'download_failed'])
        time.sleep(1)
    with open(LOG_CSV, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(['university','page_title','page_url','file_page','orig_url','orig_filename','license','saved_path'])
        for r in rows:
            writer.writerow(r)
    print("Done. CSV log at", LOG_CSV)

if __name__ == '__main__':
    main()
