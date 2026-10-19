import { conditionHolds } from '../../../frontend-src/runtime/conditions';
import { resolveVisibility } from '../../../frontend-src/runtime/visibility';

// Ruling R3: pozulmuş şərt/qayda datası hər iki mühərrikdə eyni cür rədd
// olunmalıdır. `RuleValidator` belə sxemləri heç vaxt saxlamır, amma
// runtime cütü hələ də razılaşmalıdır — bax .superpowers/sdd/2026-09-24-
// quoteform-06-submissions/task-4-report.md, "Fix round 1".
describe( 'malformed rule/condition data (Ruling R3)', () => {
	// 1. condition.field mövcuddur, amma sətir deyil.
	it( 'treats a non-string condition.field as false, not a stringified template', () => {
		expect(
			conditionHolds( { field: [ 'a' ], operator: 'equals', value: 1 }, { a: 1 } )
		).toBe( false );
	} );

	// 2. rule.conditions içində obyekt olmayan element (məs. null).
	it( 'treats a non-object condition entry as false instead of throwing', () => {
		expect( conditionHolds( null, {} ) ).toBe( false );
		expect( conditionHolds( undefined, {} ) ).toBe( false );
		expect( conditionHolds( 'nonsense', {} ) ).toBe( false );
	} );

	// 3. rule.target.key sətir deyil (məs. rəqəm) → qayda keçilir.
	it( 'skips a rule whose target.key is not a string', () => {
		const schema = {
			fields: { a: { key: 'a', type: 'number', label: 'A', required: false } },
			steps: [ { key: 'one', fields: [ 'a' ] } ],
			rules: [
				{
					target: { kind: 'field', key: 5 },
					action: 'hide',
					match: 'any',
					conditions: [ { field: 'a', operator: 'equals', value: 1 } ],
				},
			],
		};

		const resolved = resolveVisibility( schema, { a: 1 } );

		expect( resolved.fields.has( 'a' ) ).toBe( true );
	} );

	// 4. Sahə tərifi `null` — mövcud sayılmamalıdır.
	//
	// `resolveVisibility` schema.fields-i həm `Object.keys()` ilə (görünürlük/
	// dəyər hesablaması), həm `hasOwnProperty` ilə (qayda hədəfinin mövcudluğu)
	// oxuyur. Bir açarın DƏYƏRİ `null` olan, real JSON-dan gələn sxemdə, birinci
	// yol (values.js `rawValue`, `field.key`-ə toxunur) artıq — bu düzəlişdən
	// ASILI OLMAYARAQ, həm JS-də, həm PHP-də (yoxlanılıb: `Values::normalise()`
	// `array $field` tələb edir, `null` verilsə `TypeError` atır) eyni cür partlayır.
	// Yəni bu forma real sxemdə HƏR İKİ mühərrikdə eyni nəticəyə (xəta) gətirir —
	// R3-ün "divergensiya" mənası daşımır, ona görə Values/values.js-ə toxunulmayıb.
	//
	// `applyRules`-in düzəlmiş mövcudluq yoxlamasını (məhz bu tapşırığın
	// dəyişdiyi kodu) həmin ayrı partlayışa toxunmadan sınamaq üçün, `a` açarını
	// sayılmayan (`enumerable: false`) xüsusiyyət kimi qururuq: `Object.keys()`
	// (və deməli `initialState`/`variablesFor`) onu görməz, amma köhnə
	// `hasOwnProperty` yoxlaması onu "mövcuddur" sayardı — məhz item 4-ün təsvir
	// etdiyi uyğunsuzluq. Bu, JSON-da təmsil olunmayan sintetik hal olsa da,
	// dəyişən kodun MƏHZ dəyişən budağını (`fields[key] !== null && typeof ... === 'object'`)
	// heç bir əlaqəsiz partlayış olmadan sınayır.
	it( 'treats a null field definition as a non-existent target', () => {
		const fields = { b: { key: 'b', type: 'text', label: 'B', required: false } };
		Object.defineProperty( fields, 'a', { value: null, enumerable: false, configurable: true } );

		const schema = {
			fields,
			steps: [ { key: 'one', fields: [ 'b' ] } ],
			rules: [
				{
					target: { kind: 'field', key: 'a' },
					action: 'require',
					match: 'all',
					conditions: [ { field: 'b', operator: 'is_empty' } ],
				},
			],
		};

		expect( () => resolveVisibility( schema, { b: '' } ) ).not.toThrow();

		const resolved = resolveVisibility( schema, { b: '' } );

		expect( resolved.required.has( 'a' ) ).toBe( false );
	} );

	// Sənədləşdirmə üçün: real (JSON-dan gələn) `null` sahə tərifi hər iki
	// mühərrikdə eyni cür partlayır — divergensiya deyil, ona görə R3-ün
	// hədəfi deyil. PHP tərəfi eyni girişlə `tests/php/Runtime/VisibilityTest.php`-də
	// `Quoteform\Runtime\Values::normalise(): Argument #1 ($field) must be of
	// type array, null given` ilə eyni cür atır (əl ilə yoxlanılıb, docker php:8.2-cli).
	it( 'documents that a real (JSON) null field definition throws symmetrically, not divergently', () => {
		const schema = {
			fields: { a: null, b: { key: 'b', type: 'text', label: 'B', required: false } },
			steps: [ { key: 'one', fields: [ 'a', 'b' ] } ],
			rules: [],
		};

		expect( () => resolveVisibility( schema, { b: '' } ) ).toThrow();
	} );
} );
