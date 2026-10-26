#!/usr/bin/env python3
"""Collect RunicWorld public trade observations into shared seven-day data.
Trade history is partial when the server exposes only its most recent records.
"""
import collections
import datetime
import hashlib
import json
import os
import pathlib
import sys
import urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[1]
HISTORY=ROOT/'trade_history.json'
SUMMARY=ROOT/'trade_volume_summary.json'
URL=os.environ.get('RUNICWORLD_MARKET_URL','https://runicworld.com/api/site/ge/market')
WINDOW=7*86400

def identity(t):
    parts=[t.get('entry'),str(t['name']).lower(),int(t['at']),int(t['price']),int(t['qty'])]
    return hashlib.sha256(json.dumps(parts,separators=(',',':')).encode()).hexdigest()[:24]

def collect(now=None, payload=None):
    now=int(now or datetime.datetime.now(datetime.timezone.utc).timestamp())
    if payload is None:
        req=urllib.request.Request(URL,headers={'Accept':'application/json','User-Agent':'RunicWorld-Profit-Finder-Community-Collector/1.0'})
        with urllib.request.urlopen(req,timeout=40) as res:payload=json.load(res)
    if not isinstance(payload,dict) or not isinstance(payload.get('trades'),list) or not isinstance(payload.get('items'),list):
        raise ValueError('Unexpected market API payload; refusing to erase existing history')
    try:old=json.loads(HISTORY.read_text('utf-8'))
    except FileNotFoundError:old={}
    trades={}
    for item in old.get('trades',[]):
        if isinstance(item,dict) and now-WINDOW<=item.get('at',-1)<=now+60:
            trades[identity(item)]=item
    for row in payload['trades']:
        try:
            t={'entry':int(row['entry']) if row.get('entry') is not None else None,'name':str(row['name']).strip(),'at':int(row['at']),'price':int(row['price']),'qty':int(row['qty'])}
            if not t['name'] or t['qty']<=0 or not (now-WINDOW<=t['at']<=now+60):continue
            trades[identity(t)]=t
        except (KeyError,TypeError,ValueError):continue
    rows=sorted(trades.values(),key=lambda x:(x['at'],x['name'],x['price'],x['qty']))
    first=int(old.get('first_collection_at') or now)
    history={'schema':1,'first_collection_at':first,'last_collection_at':now,'trade_count':len(rows),'trades':rows}
    # Use item ID where available; keep name as fallback only. Do not infer
    # complete 1h/7d volume from a capped recent-trade feed.
    counts=collections.defaultdict(lambda:[0,0])
    for t in rows:
        key=str(t['entry']) if t['entry'] is not None else 'name:'+t['name'].lower()
        if t['at']>=now-3600:counts[key][0]+=t['qty']
        counts[key][1]+=t['qty']
    by_item={}
    for item in payload['items']:
        if not isinstance(item,dict) or not item.get('name'):continue
        key=str(item.get('entry')) if item.get('entry') is not None else 'name:'+item['name'].lower()
        hour,week=counts[key]
        day=item.get('vol24h')
        try:day=max(0,int(day)) if day is not None else None
        except (TypeError,ValueError):day=None
        by_item[item['name'].strip().lower()]={'entry':item.get('entry'),'hour':hour,'day':day,'week':week,'day_kind':'api_reported' if day is not None else 'unavailable'}
    summary={'schema':1,'generated_at':now,'first_collection_at':first,'last_collection_at':now,'poll_interval_minutes':15,'recent_feed_limit':len(payload['trades']),'observation_count':len(rows),'limitations':'Hour/week are observed lower bounds from capped recent trades; missed trades cannot be recovered. The 24-hour figure comes from the live API.','items':by_item}
    HISTORY.write_text(json.dumps(history,separators=(',',':'))+'\n',encoding='utf-8')
    SUMMARY.write_text(json.dumps(summary,separators=(',',':'))+'\n',encoding='utf-8')
    print(f'Updated {len(rows)} unique observations; {len(by_item)} items')

if __name__=='__main__':collect()
