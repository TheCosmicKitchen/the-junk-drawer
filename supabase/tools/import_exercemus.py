"""Builds supabase/sql/38_exercise_library.sql from the exercemus open exercise list.

    py -I supabase/tools/import_exercemus.py exercises.json ours.txt > supabase/sql/38_exercise_library.sql

exercises.json: https://github.com/exercemus/exercises (MIT), pinned below. ours.txt: our live
catalogue, one exercise per line as "Name|other name|other name" (an export of lift_exercises and
lift_exercise_aliases); it only decides which exercemus names are a lift we already have.

What it takes from exercemus: names and other names, muscles (main and secondary) and equipment,
for the strength-type categories (strength, olympic weightlifting, strongman, calisthenics). Never
the instructions, tips, descriptions, images or videos.

Synonyms: names that mean the same lift become one exercise with one main name, the rest its other
names ("Barbell Bench Press" and "Bench Press, Barbell" are Bench Press). Names are compared as a set
of normalised words (plurals, hyphens, word order and spelling variants don't matter), and "barbell"
is the default for a lift that names no equipment (Deadlift is the barbell one). A lift we already
have always keeps our name.
"""
import json, re, sys
from collections import defaultdict

SOURCE = 'https://github.com/exercemus/exercises (MIT), commit 0ee5b742928b0c910883fa1c0c2cfaf26c4ee180'
KEEP = {'strength', 'olympic weightlifting', 'strongman', 'calisthenics'}

# One spelling per word. Applied to whole words after hyphens and slashes become spaces.
WORD = {
    'pullup': 'pull up', 'pullups': 'pull up', 'chinup': 'chin up', 'chinups': 'chin up', 'pushup': 'push up', 'pushups': 'push up',
    'situp': 'sit up', 'situps': 'sit up', 'stepup': 'step up', 'stepups': 'step up', 'ups': 'up',
    'flyes': 'fly', 'flye': 'fly', 'flys': 'fly', 'flies': 'fly',
    'skullcrusher': 'skull crusher', 'skullcrushers': 'skull crusher', 'triceps': 'tricep', 'biceps': 'bicep',
    'db': 'dumbbell', 'dumbell': 'dumbbell', 'bb': 'barbell', 'kb': 'kettlebell', 'ez': 'ezbar', 'ezbar': 'ezbar',
    'laying': 'lying', 'prone': 'lying', 'hex': 'trapbar', 'trap': 'trap', 'military': 'overhead',
    'bentover': 'bent over', 'sidelateral': 'lateral', 'delt': 'delt', 'deltoid': 'delt', 'delts': 'delt',
    'hyperextension': 'back extension', 'hyperextensions': 'back extension', 'rdl': 'romanian deadlift',
    'ohp': 'overhead press', 'with': '', 'the': '', 'a': '', 'on': '', 'to': '', 'and': '', 'of': '', 'exercise': '',
}
# Pairs the word rules can't see, as (exercemus name, ours). Checked by hand.
SAME = {
    'barbell shoulder press': 'Overhead Press', 'standing overhead press': 'Overhead Press', 'overhead press': 'Overhead Press',
    'romanian deadlift': 'RDL', 'farmer walk': "Farmer's Carry",
    'hyperextensions back extensions': 'Back Extension', 'chin up': 'Chin-ups', 'pullups': 'Pull-ups', 'pull up': 'Pull-ups',
    'push up': 'Push-ups', 'push ups': 'Push-ups', 'bench dips': 'Dips', 'dips triceps focus': 'Dips',
    'triceps pushdown': 'Tricep Pushdown', 'triceps pushdown rope attachment': 'Tricep Pushdown', 'cable crossover': 'Cable Cross',
    'seated cable rows': 'Seated Cable Row', 'lying leg curls': 'Lying Leg Curl',
    'standing calf raises': 'Standing Calf Raise', 'leg extensions': 'Leg Extension',
    'wide grip lat pulldown': 'Wide Grip Lat Pulldown', 'close grip front lat pulldown': 'Close Grip Lat Pulldown',
    'face pull': 'Face Pull', 'side lateral raise': 'Lateral Raise', 'dumbbell lateral raise': 'Lateral Raise',
    'front dumbbell raise': 'Front Raise', 'reverse flyes': 'Reverse Fly', 'reverse machine flyes': 'Rear Delta Fly Machine',
    'one arm dumbbell row': 'Single-Arm Dumbbell Row', 'bent over barbell row': 'Barbell Bent-Over Row',
    'trap bar deadlift': 'Trap Bar Deadlift', 'kettlebell one legged deadlift': 'Single-Leg Romanian Deadlift',
    'barbell full squat': 'Barbell Squat', 'barbell squat': 'Barbell Squat', 'plank': 'Plank',
}
# Movements that mean the barbell version when no equipment is named ("Deadlift", "Bench Press").
BARBELL_DEFAULT = re.compile(r'\b(bench press|squat|deadlift|good morning)\b')
# Lifts measured in time or distance, by name.
DISTANCE = re.compile(r"\b(carry|walk|yoke|sled push|sled drag|prowler)\b|\b(backward|forward) drag\b", re.I)
TIME = re.compile(r"^(side )?plank$|\bhold\b|\bdead hang\b|\bwall sit\b|\bl-sit\b", re.I)

def words(name):
    s = name.lower().replace("'", '').replace('’', '')
    s = re.sub(r'[\-/,()&+.]', ' ', s)
    out = []
    for w in s.split():
        w = WORD.get(w, w)
        for x in w.split():
            if len(x) > 3 and x.endswith('s') and not x.endswith('ss'): x = x[:-1]
            if x: out.append(x)
    return out

def key(name):
    return ' '.join(sorted(set(words(name))))

EQUIPMENT_WORDS = {'barbell', 'dumbbell', 'cable', 'machine', 'kettlebell', 'band', 'smith', 'ezbar', 'trapbar', 'landmine', 'plate', 'bodyweight', 'sled'}
def keys(name):
    """Every key a name could match on: its own, and without "barbell" (the default equipment)."""
    w = set(words(name))
    out = [' '.join(sorted(w))]
    plain = ' '.join(x for x in words(name) if x != 'barbell')
    if 'barbell' in w and BARBELL_DEFAULT.search(plain) and 'hack' not in w: out.append(' '.join(sorted(w - {'barbell'})))
    return out

def tidy(name):
    return re.sub(r'\s+', ' ', name).strip()[:80]

def main(src, ours_path):
    data = json.load(open(src, encoding='utf-8'))
    ours = []   # (main name, [names])
    for line in open(ours_path, encoding='utf-8'):
        names = [n.strip() for n in line.split('|') if n.strip()]
        if names: ours.append((names[0], names))
    ours_by_key = {}
    for main, names in ours:
        for n in names:
            for k in keys(n): ours_by_key.setdefault(k, main)
    ours_by_lower = {main.lower(): main for main, _ in ours}

    groups = defaultdict(lambda: {'names': [], 'ex': []})   # canon key -> names and exercemus rows
    for e in data['exercises']:
        if e['category'] not in KEEP: continue
        names = [e['name']] + (e.get('aliases') or [])
        mine = None
        for n in names:
            s = SAME.get(' '.join(words(n)))
            if s: mine = s; break
            for k in keys(n):
                if k in ours_by_key: mine = ours_by_key[k]; break
            if mine: break
        g = groups['ours:' + mine] if mine else groups['new:' + key(e['name'])]
        g['names'] += names
        g['ex'].append(e)
        g['ours'] = mine

    rows = []
    for gk, g in groups.items():
        ex = g['ex']
        if g.get('ours'):
            canon = g['ours']
        else:
            # The plainest name: no brackets or dashes, then the shortest.
            canon = tidy(sorted(g['names'], key=lambda n: (bool(re.search(r'[()\-/]', n)), len(n), n))[0])
        prim, sec, equip = [], [], []
        for e in ex:
            for m in e.get('primary_muscles') or []:
                if m not in prim: prim.append(m)
            for m in e.get('secondary_muscles') or []:
                if m not in sec: sec.append(m)
            for q in e.get('equipment') or []:
                if q not in equip: equip.append(q)
        sec = [m for m in sec if m not in prim]
        aliases = sorted({tidy(n) for n in g['names'] if tidy(n).lower() != canon.lower()}, key=str.lower)
        bw = any(q in ('none', 'pull-up bar') for q in equip)
        log = 'distance' if DISTANCE.search(canon) else 'time' if TIME.search(canon) else 'reps'
        rows.append({'name': canon, 'ours': bool(g.get('ours')), 'aliases': aliases, 'muscles': prim, 'muscles_also': sec,
                     'equipment': [q for q in equip if q != 'none'] or (['none'] if 'none' in equip else []), 'bw': bw, 'log_type': log})
    rows.sort(key=lambda r: (not r['ours'], r['name'].lower()))
    return data, rows

def sql_text(t): return "'" + t.replace("'", "''") + "'"
def sql_arr(a): return 'array[' + ', '.join(sql_text(x) for x in a) + ']::text[]' if a else "'{}'::text[]"

def emit(data, rows, out):
    w = out.write
    n_ours = sum(r['ours'] for r in rows)
    w('-- 38_exercise_library.sql\n-- To be applied as migration 38_exercise_library. Generated by supabase/tools/import_exercemus.py;\n')
    w('-- edit the script and re-run it rather than editing this file.\n--\n')
    w('-- Exercise data from ' + SOURCE + ':\n')
    w('-- names and other names, muscles and equipment for every strength-type exercise (strength,\n')
    w('-- olympic weightlifting, strongman, calisthenics). No instructions, tips, images or videos.\n--\n')
    w('-- 1. Three new columns on lift_exercises: muscles (main), muscles_also (secondary), equipment,\n')
    w('--    each from exercemus\'s own lists, so a muscle is always one of the 21 it names.\n')
    w('-- 2. %d lifts we already have get their muscles and equipment, and exercemus\'s names for them\n' % n_ours)
    w('--    become other names (search "Barbell Bench Press" and you find Bench Press).\n')
    w('-- 3. %d new lifts, each with one main name; names that mean the same lift are its other names.\n' % (len(rows) - n_ours))
    w('--    A new lift whose name (or other name) is already in the catalogue is skipped.\n')
    w('-- Nothing is renamed or deleted, and no one\'s sets change.\n\n')
    muscles = data['muscles']; equipment = [q for q in data['equipment']]
    w('alter table public.lift_exercises\n  add column if not exists muscles text[] not null default \'{}\',\n')
    w('  add column if not exists muscles_also text[] not null default \'{}\',\n  add column if not exists equipment text[] not null default \'{}\';\n')
    w('alter table public.lift_exercises drop constraint if exists lift_exercises_muscles_known;\n')
    w('alter table public.lift_exercises add constraint lift_exercises_muscles_known check (\n')
    w('  muscles <@ %s and muscles_also <@ %s\n' % (sql_arr(muscles), sql_arr(muscles)))
    w('  and equipment <@ %s\n' % sql_arr(equipment))
    w('  and cardinality(muscles) <= 8 and cardinality(muscles_also) <= 12 and cardinality(equipment) <= 6);\n\n')
    w(IMPORT_FN)
    w('-- Members read the new columns through the table\'s select grant; the admin can set them on a new\n')
    w('-- exercise or correct them later (the catalogue\'s write policies already allow only the admin).\n')
    w('grant insert (muscles, muscles_also, equipment), update (muscles, muscles_also, equipment) on public.lift_exercises to authenticated;\n\n')
    calls = chunks(rows)
    w('-- The rows, in %d chunks of [name, ours (1/0), other names, muscles, muscles also, equipment,\n-- bodyweight (1/0), log type (r/t/d)].\n' % len(calls))
    for part in calls: w(call(part))

# Rows go to the database as compact JSON, a chunk per call, so the migration can also be applied a
# chunk at a time.
def chunks(rows, per=120): return [rows[i:i + per] for i in range(0, len(rows), per)]
def pack(r): return [r['name'], 1 if r['ours'] else 0, r['aliases'], r['muscles'], r['muscles_also'], r['equipment'], 1 if r['bw'] else 0, r['log_type'][0]]
def call(part):
    return "select private.import_exercises('" + json.dumps([pack(r) for r in part], ensure_ascii=False, separators=(',', ':')).replace("'", "''") + "'::jsonb);\n"

# Lifts we have: fill in muscles and equipment where none are recorded. New lifts: added unless a name
# or other name is already taken. Other names: added where free. Safe to run again.
IMPORT_FN = """create or replace function private.import_exercises(rows jsonb)
returns void
language plpgsql
set search_path = ''
as $f$
begin
  create temp table if not exists x (name text, ours boolean, aliases text[], muscles text[], muscles_also text[], equipment text[], bw boolean, log_type text) on commit drop;
  truncate x;
  insert into x
  select r->>0, (r->>1)::int = 1,
         array(select jsonb_array_elements_text(r->2)), array(select jsonb_array_elements_text(r->3)),
         array(select jsonb_array_elements_text(r->4)), array(select jsonb_array_elements_text(r->5)),
         (r->>6)::int = 1, case r->>7 when 't' then 'time' when 'd' then 'distance' else 'reps' end
    from jsonb_array_elements(rows) r;

  update public.lift_exercises e set muscles = x.muscles, muscles_also = x.muscles_also, equipment = x.equipment
    from x where x.ours and lower(btrim(e.name)) = lower(btrim(x.name)) and e.deleted_at is null and e.muscles = '{}';

  insert into public.lift_exercises (name, kind, log_type, supports_bodyweight, muscles, muscles_also, equipment)
  select x.name, 'strength', x.log_type, x.bw, x.muscles, x.muscles_also, x.equipment from x
   where not x.ours
     and not exists (select 1 from public.lift_exercises e where e.deleted_at is null and lower(btrim(e.name)) = any (select lower(btrim(n)) from unnest(x.name || x.aliases) n))
     and not exists (select 1 from public.lift_exercise_aliases a where a.deleted_at is null and lower(btrim(a.alias)) = any (select lower(btrim(n)) from unnest(x.name || x.aliases) n));

  insert into public.lift_exercise_aliases (exercise_id, alias)
  select distinct on (lower(btrim(al))) e.id, al from x cross join lateral unnest(x.aliases) al
    join public.lift_exercises e on lower(btrim(e.name)) = lower(btrim(x.name)) and e.deleted_at is null
   where not exists (select 1 from public.lift_exercises o where o.deleted_at is null and lower(btrim(o.name)) = lower(btrim(al)))
     and not exists (select 1 from public.lift_exercise_aliases a where a.deleted_at is null and lower(btrim(a.alias)) = lower(btrim(al)))
   order by lower(btrim(al));
end;
$f$;
revoke all on function private.import_exercises(jsonb) from public, anon, authenticated;

"""

if __name__ == '__main__':
    data, rows = main(sys.argv[1], sys.argv[2])
    if len(sys.argv) > 3 and sys.argv[3] == '--review':
        for r in rows:
            if r['ours'] or r['aliases']:
                print(('OURS ' if r['ours'] else 'NEW  ') + r['name'] + '  <=  ' + ' | '.join(r['aliases']))
        print('ours enriched:', sum(r['ours'] for r in rows), ' new:', sum(not r['ours'] for r in rows))
    elif len(sys.argv) > 3:   # just one chunk's call, to apply a piece at a time
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stdout.write(call(chunks(rows)[int(sys.argv[3])]))
    else:
        sys.stdout.reconfigure(encoding='utf-8')
        emit(data, rows, sys.stdout)
