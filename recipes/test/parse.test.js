// Tests for recipes/parse.js.  Run:  node recipes/test/parse.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
globalThis.window = globalThis;
for (const f of ['core.js', 'parse.js']) (0, eval)(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const { parse } = globalThis.RecipeParse;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + e.message.split('\n').join('\n  ')); }
}
const one = text => { const out = parse(text); assert.strictEqual(out.length, 1, 'expected 1 recipe, got ' + out.length); return out[0]; };

test('a typical typed-up recipe', () => {
  const { recipe: r, warnings } = one(`Grandma's Chocolate Chip Cookies
From Grandma Rosa
Makes 36 cookies · 45 minutes
Tags: cookies, baking, Christmas

Chewy in the middle, crisp at the edges. She made these every Christmas.

Ingredients:
- 2 1/4 cups all-purpose flour
- 1 tsp baking soda
- 1 cup butter, softened
- 2 cups chocolate chips

Method
1. Heat the oven to 375°F.
2. Cream the butter and sugars until fluffy, then beat in the eggs
   one at a time.
3. Stir in the flour, then the chips. Bake 9 to 11 minutes.

Notes: The dough freezes well.`);
  assert.strictEqual(r.title, "Grandma's Chocolate Chip Cookies");
  assert.strictEqual(r.id, 'grandmas-chocolate-chip-cookies');
  assert.strictEqual(r.from, 'Grandma Rosa');
  assert.strictEqual(r.serves, 36);
  assert.strictEqual(r.unit, 'cookies');
  assert.strictEqual(r.time, '45 minutes');
  assert.deepStrictEqual(r.tags, ['cookies', 'baking', 'christmas']);
  assert.match(r.intro, /^Chewy/);
  assert.deepStrictEqual(r.ingredients, ['2 1/4 cups all-purpose flour', '1 tsp baking soda', '1 cup butter, softened', '2 cups chocolate chips']);
  assert.strictEqual(r.steps.length, 3);
  assert.strictEqual(r.steps[1], 'Cream the butter and sugars until fluffy, then beat in the eggs one at a time.');
  assert.strictEqual(r.notes, 'The dough freezes well.');
  assert.deepStrictEqual(warnings, []);
});

test('ingredient groups and unnumbered steps', () => {
  const { recipe: r } = one(`Lemon Crinkles
Serves: 4-6
Prep time: 15 min
Cook time: 10 min

INGREDIENTS
For the dough:
1 cup flour
1/2 cup sugar
FOR THE GLAZE
1 cup powdered sugar
2 tbsp lemon juice

DIRECTIONS
Mix the dough and chill it.
Roll into balls and bake.
Whisk the glaze and drizzle it over.`);
  assert.deepStrictEqual(Object.keys(r.ingredients), ['For the dough', 'For the glaze']);
  assert.strictEqual(r.serves, 6);
  assert.strictEqual(r.time, 'prep 15 min, cook 10 min');
  assert.strictEqual(r.steps.length, 3);
});

test('several recipes pasted back to back, no separators', () => {
  const out = parse(`Snickerdoodles
Makes 2 dozen

Soft cinnamon cookies.

Ingredients
1 cup butter
2 3/4 cups flour

Method
1. Cream the butter.
2. Bake 10 minutes.

Shortbread
Ingredients
1 cup butter
2 cups flour
Method
Mix and bake.
Notes: Prick with a fork.

Gingersnaps
Makes 30 cookies

Ingredients
3/4 cup shortening
2 cups flour

Directions
Roll in sugar and bake.`);
  assert.deepStrictEqual(out.map(x => x.recipe.title), ['Snickerdoodles', 'Shortbread', 'Gingersnaps']);
  assert.strictEqual(out[0].recipe.serves, 24);
  assert.strictEqual(out[0].recipe.intro, 'Soft cinnamon cookies.');
  assert.strictEqual(out[0].recipe.steps.length, 2);
  assert.strictEqual(out[1].recipe.notes, 'Prick with a fork.');
  assert.strictEqual(out[2].recipe.serves, 30);
  out.forEach(x => assert.deepStrictEqual(x.warnings, [], x.recipe.title + ': ' + x.warnings.join('; ')));
});

test('separators split recipes', () => {
  const out = parse(`Oat Cookies\nIngredients\n1 cup oats\nMethod\nBake.\n---\nPecan Sandies\nIngredients\n1 cup pecans\nMethod\nBake.`);
  assert.deepStrictEqual(out.map(x => x.recipe.title), ['Oat Cookies', 'Pecan Sandies']);
});

test('Markdown, with # titles', () => {
  const out = parse(`# Thumbprints
*Makes 24*

## Ingredients
- 1 cup butter
- **2 cups** flour

## Steps
1. Mix.
2. Press a thumb in each.

# Biscotti

## Ingredients
* 3 eggs
* 2 cups flour

## Method
1. Bake twice.`);
  assert.deepStrictEqual(out.map(x => x.recipe.title), ['Thumbprints', 'Biscotti']);
  assert.deepStrictEqual(out[0].recipe.ingredients, ['1 cup butter', '2 cups flour']);
  assert.deepStrictEqual(out[0].recipe.steps, ['Mix.', 'Press a thumb in each.']);
});

test('no headings at all: ingredients and steps are guessed, with a warning', () => {
  const { recipe: r, warnings } = one(`Peanut Butter Cookies
1 cup peanut butter
1 cup sugar
1 egg
Mix everything together.
Roll into balls, press with a fork and bake at 350°F for 10 minutes.`);
  assert.strictEqual(r.ingredients.length, 3);
  assert.strictEqual(r.steps.length, 2);
  assert.strictEqual(warnings.length, 1);
});

test('"Makes about 3 dozen" and "Yield: 1 loaf"', () => {
  assert.strictEqual(one('A\nMakes about 3 dozen cookies\nIngredients\n1 egg\nMethod\nBake.').recipe.serves, 36);
  const r = one('B\nYield: 1 loaf\nIngredients\n1 egg\nMethod\nBake.').recipe;
  assert.strictEqual(r.serves, 1); assert.strictEqual(r.unit, 'loaf');
});

test('schema.org Recipe from a web page', () => {
  const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},
    {"@type":["Recipe"],"name":"Brown Butter Cookies &amp; Sea Salt","author":{"@type":"Person","name":"Jo"},
     "recipeYield":["24","24 cookies"],"totalTime":"PT1H15M","keywords":"cookies, brown butter",
     "recipeCategory":"Dessert","description":"<p>Nutty.</p>",
     "recipeIngredient":["1 cup butter","2 cups flour"],
     "recipeInstructions":[{"@type":"HowToSection","name":"Dough","itemListElement":[{"@type":"HowToStep","text":"Brown the butter."}]},
       {"@type":"HowToStep","text":"Bake 12 minutes."}],
     "video":{"@type":"VideoObject","embedUrl":"https://www.youtube.com/embed/abcdefghijk"}}]}</script></head></html>`;
  const { recipe: r, warnings } = one(html);
  assert.strictEqual(r.title, 'Brown Butter Cookies & Sea Salt');
  assert.strictEqual(r.from, 'Jo');
  assert.strictEqual(r.serves, 24); assert.strictEqual(r.unit, 'cookies');
  assert.strictEqual(r.time, '1 hour 15 minutes');
  assert.deepStrictEqual(r.tags, ['cookies', 'brown butter', 'dessert']);
  assert.strictEqual(r.intro, 'Nutty.');
  assert.deepStrictEqual(r.steps, ['Brown the butter.', 'Bake 12 minutes.']);
  assert.strictEqual(r.video, 'https://www.youtube.com/embed/abcdefghijk');
  assert.deepStrictEqual(warnings, []);
});

test('a family file, and a list of recipes', () => {
  const fam = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'our-kitchen.json'), 'utf8'));
  const out = parse(JSON.stringify(fam));
  assert.strictEqual(out.length, fam.recipes.length);
  assert.deepStrictEqual(out[0].recipe.ingredients, fam.recipes[0].ingredients);
  assert.strictEqual(parse([{ title: 'X', ingredients: ['1 egg'], steps: ['Go.'] }]).length, 1);
});

test('copied from a recipe website, clutter and all', () => {
  const { recipe: r, warnings } = one(`Print Recipe
Pin Recipe
Soft Molasses Cookies
5 from 212 votes
Big, soft and chewy, with crackly tops.
Prep Time: 15 minutes
Cook Time: 10 minutes
Course: Dessert
Servings: 24 cookies
Calories: 160kcal
Author: Sally
Ingredients
1x 2x 3x
US Customary Metric
▢ 2 1/4 cups flour
▢ 1 tsp ginger
▢ 3/4 cup butter
Instructions
Whisk the dry ingredients.
Beat the butter and sugar, then add the molasses.
Notes
Chill the dough for at least 2 hours.
Nutrition
Calories: 160kcal | Carbohydrates: 24g`);
  assert.strictEqual(r.title, 'Soft Molasses Cookies');
  assert.strictEqual(r.from, 'Sally');
  assert.strictEqual(r.serves, 24); assert.strictEqual(r.unit, 'cookies');
  assert.strictEqual(r.time, 'prep 15 minutes, cook 10 minutes');
  assert.deepStrictEqual(r.tags, ['dessert']);
  assert.strictEqual(r.intro, 'Big, soft and chewy, with crackly tops.');
  assert.deepStrictEqual(r.ingredients, ['2 1/4 cups flour', '1 tsp ginger', '3/4 cup butter']);
  assert.strictEqual(r.steps.length, 2);
  assert.strictEqual(r.notes, 'Chill the dough for at least 2 hours.');
  assert.deepStrictEqual(warnings, []);
});

test('limits are kept, so the database never refuses a save', () => {
  const steps = Array.from({ length: 70 }, (_, i) => (i + 1) + '. Step ' + i + '.').join('\n');
  const { recipe: r } = one('T'.repeat(200) + '\nTags: ' + 'x'.repeat(40) + ', ok\nIngredients\n1 egg\nMethod\n' + steps);
  assert.strictEqual(r.title.length, 120);
  assert.strictEqual(r.steps.length, 60);
  assert.deepStrictEqual(r.tags, ['ok']);
});

test('a non-YouTube video is dropped with a warning', () => {
  const r = parse([{ title: 'X', video: 'https://example.com/v', ingredients: ['1 egg'], steps: ['Go.'] }])[0];
  assert.strictEqual(r.recipe.video, undefined);
  assert.strictEqual(r.warnings.length, 1);
});

console.log(passed + ' passed, ' + failed + ' failed');
process.exitCode = failed ? 1 : 0;
