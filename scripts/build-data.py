# Generates src/data/plants.json and src/data/perdiem.json from the public source files in data-src/.
import json, openpyxl, datetime
ST = {'Alabama':'AL','Arizona':'AZ','Arkansas':'AR','California':'CA','Connecticut':'CT','Florida':'FL','Georgia':'GA','Illinois':'IL','Kansas':'KS','Louisiana':'LA','Maryland':'MD','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Nebraska':'NE','New Hampshire':'NH','New Jersey':'NJ','New York':'NY','North Carolina':'NC','Ohio':'OH','Pennsylvania':'PA','South Carolina':'SC','Tennessee':'TN','Texas':'TX','Virginia':'VA','Washington':'WA','Wisconsin':'WI'}
eia = {f['attributes']['Plant_Code']: f['attributes'] for f in json.load(open('data-src/eia.json'))['features']}
out = []
for sid, name, units, rtype, loc, owner, region, code in json.load(open('data-src/nrc-sites.json')):
    if code:
        e = eia[code]
        p = dict(lat=e['Latitude'], lon=e['Longitude'], city=e['City'], county=e['County'], state=ST[e['State']], eiaName=e['Plant_Name'], eiaCode=code, mw=e['Total_MW'])
    else:  # Palisades (restarted 2025) is not in the EIA layer as nuclear
        p = dict(lat=42.3225, lon=-86.3147, city='Covert', county='Van Buren', state='MI', eiaName=None, eiaCode=None, mw=None, coordNote='Approximate site coordinates (not in EIA operating-nuclear layer)')
    out.append(dict(id=sid, name=name, units=units, type=rtype, nrcLocation=loc, owner=owner, region=region, **p))
json.dump(out, open('src/data/plants.json', 'w'), indent=0)
ws = openpyxl.load_workbook('data-src/fy27.xlsx').active
rows = list(ws.iter_rows(values_only=True))
assert rows[0][0].startswith('FY2027')
def d(s): return datetime.datetime.strptime(s, '%B %d, %Y').strftime('%m-%d')
std = rows[2]; nsa = []
for r in rows[3:]:
    if not r[0]: continue
    nsa.append(dict(st=r[0], dest=r[1], counties=[c.strip() for c in str(r[2] or '').split('/')], b=d(r[3]), e=d(r[4]), lodging=r[5], mie=r[6]))
json.dump(dict(fy=2027, effective='2026-10-01 to 2027-09-30', file='FY2027_PerDiemRates_Validated090126.xlsx', standard=dict(lodging=std[5], mie=std[6]), nsa=nsa), open('src/data/perdiem.json', 'w'))
print(len(out), 'plants', len(nsa), 'nsa rows', std[5], std[6])
