#!/usr/bin/env python3
"""Generate public, static NPC pricing references from wiki-derived OSRSReboxed data.
No third-party Python packages required. Downloads occur only in GitHub Actions.
"""
import json, urllib.request, datetime, pathlib, collections
ROOT=pathlib.Path(__file__).resolve().parents[1]
BASE='https://raw.githubusercontent.com/RSPSApp/osrsreboxed-db/master/docs/'
CUTOFF=datetime.date(2007,8,10)

def get(name):
    req=urllib.request.Request(BASE+name,headers={'User-Agent':'RunicWorldProfitFinder/6.5 (public-reference-import)'})
    with urllib.request.urlopen(req,timeout=180) as response:
        return json.load(response)

def main():
    data=get('items-complete.json'); shops=get('shops-items-by-shop.json')
    if isinstance(data,dict): items=list(data.values())
    elif isinstance(data,list): items=data
    else: raise ValueError('Unexpected item data format')
    index={}; by_name={}; excluded=0
    for obj in items:
        if not isinstance(obj,dict):continue
        try: item_id=int(obj['id']); value=int(obj['cost'])
        except (ValueError,KeyError,TypeError):continue
        name=str(obj.get('name','')).strip()
        if not name or name.lower() in {'null','none'} or obj.get('noted') or obj.get('placeholder') or obj.get('duplicate'):continue
        release=obj.get('release_date')
        # Unknown release dates are deliberately not assumed to predate 2007.
        try: date=datetime.date.fromisoformat(str(release)[:10]); old=date<=CUTOFF
        except (ValueError,TypeError):old=False
        if not old:
            excluded+=1;continue
        if value<0:continue
        key=name.lower()
        entry={'id':item_id,'value':value,'source':obj.get('wiki_url') or ('https://oldschool.runescape.wiki/w/'+name.replace(' ','_')),
               'release_date':release,'tradeable':bool(obj.get('tradeable',False))}
        index[item_id]=entry
        # Prefer tradeable record for duplicate names.
        if key not in by_name or (entry['tradeable'] and not by_name[key]['tradeable']):by_name[key]=entry
    offers=collections.defaultdict(list)
    for shop_name,shop in shops.items():
        if not isinstance(shop,dict):continue
        info=shop.get('shop_info') or {}
        try:buy_pct=float(info['buys_at'])/10; sell_pct=float(info['sells_at'])/10
        except (KeyError,ValueError,TypeError):continue
        currency=str(info.get('currency','coins')).lower()
        if currency not in ('coins','coin','gp'):continue
        change=info.get('change_per')
        for stock in shop.get('items') or []:
            try: iid=int(stock['id']); units=int(stock.get('stock',0))
            except (KeyError,TypeError,ValueError):continue
            if iid not in index or units<=0:continue
            if str(stock.get('currency',currency)).lower() not in ('coins','coin','gp'):continue
            e=index[iid]; key=next((k for k,v in by_name.items() if v['id']==iid),None)
            if key is None:continue
            offers[key].append({'shop':shop_name,'buy_percent':buy_pct,'sell_percent':sell_pct,
                                'base_stock':units,'change_per':change,'item_id':iid})
    for name,entry in by_name.items():
        entry['shops']=offers.get(name,[])
    timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat()
    output={'generated_utc':timestamp,'source':BASE,'cutoff':'2007-08-10',
            'notes':'Wiki-derived reference, NOT verified RunicWorld stock/prices. Items with missing/after-cutoff release dates excluded; shop inventories may be newer.',
            'items':by_name}
    (ROOT/'wiki_item_prices.json').write_text(json.dumps(output,separators=(',',':'),ensure_ascii=False),encoding='utf8')
    print(f'Exported {len(by_name)} eligible unique item names; {len(offers)} with shop entries; {excluded} excluded item records.')
if __name__=='__main__':main()
