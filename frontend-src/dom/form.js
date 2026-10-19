import { __, _n, sprintf } from '@wordpress/i18n';

import { calculate } from '../runtime/calculate';
import { createClient } from '../runtime/client';
import { formatMoney } from '../runtime/format';
import { createState } from '../runtime/state';
import { settleStep, stepPosition, visibleSteps } from '../runtime/steps';
import { validateStep } from '../runtime/validate';
import { variablesFor } from '../runtime/values';
import { resolveVisibility } from '../runtime/visibility';

import { createAnnouncer } from './announce';
import { applyValue, bindControl } from './bind';
import { buildControl, nextNamespace } from './controls';
import { buildHoneypot, buildSuccessPanel, createSubmitUi } from './submit';

const DEBOUNCE_MS = 50;

function reconcile( parent, nodes ) {
	nodes.forEach( ( node, index ) => {
		if ( parent.children[ index ] !== node ) {
			parent.insertBefore( node, parent.children[ index ] || null );
		}
	} );

	while ( parent.children.length > nodes.length ) {
		parent.removeChild( parent.lastElementChild );
	}
}

function buildSummary() {
	const summary = document.createElement( 'div' );
	summary.className = 'quoteform_summary';

	const breakdown = document.createElement( 'ul' );
	breakdown.className = 'quoteform_breakdown';
	breakdown.setAttribute( 'data-quoteform-breakdown', '' );

	// Məbləğ <span>-dir, <output> DEYİL: <output>-un implicit ARIA rolu `status`,
	// onun da implicit `aria-live`-ı `polite`-dir. Atributu yazmamaq bunu ləğv
	// etmir — səhifədə İKİ canlı sahə qalardı və məbləğ 50ms-lik hesablama
	// ritmində danışardı. Elan yalnız announce.js-in sahəsindən gedir.
	const total = document.createElement( 'span' );
	total.className = 'quoteform_total';
	total.setAttribute( 'data-quoteform-total', '' );

	const totalRow = document.createElement( 'div' );
	totalRow.className = 'quoteform_total_row';

	const totalLabel = document.createElement( 'span' );
	totalLabel.className = 'quoteform_total_label';
	totalLabel.textContent = __( 'Estimated total', 'quoteform' );

	totalRow.appendChild( totalLabel );
	totalRow.appendChild( total );

	summary.appendChild( breakdown );
	summary.appendChild( totalRow );

	return { summary, breakdown, total };
}

function breakdownRow( row ) {
	const item = document.createElement( 'li' );

	const label = document.createElement( 'span' );
	label.className = 'quoteform_breakdown_label';
	label.textContent = row.label;

	const amount = document.createElement( 'span' );
	amount.className = 'quoteform_breakdown_amount';
	amount.textContent = row.formatted;

	item.appendChild( label );
	item.appendChild( amount );

	return item;
}

function buildStepHeader( step ) {
	const heading = document.createElement( 'h2' );
	heading.className = 'quoteform_step_title';
	heading.setAttribute( 'tabindex', '-1' );
	heading.textContent = step.title || '';

	const nodes = [ heading ];

	if ( step.description ) {
		const description = document.createElement( 'p' );
		description.className = 'quoteform_step_description';
		description.textContent = step.description;
		nodes.push( description );
	}

	return { heading, nodes };
}

function navButton( hook, label ) {
	const button = document.createElement( 'button' );

	button.type = 'button';
	button.className = `quoteform_nav_button quoteform_${ hook }`;
	button.setAttribute( `data-quoteform-${ hook }`, '' );
	button.textContent = label;

	return button;
}

// İki onluğa yuvarlanır ki, inline stil `33.333333333333336%` kimi zibil daşımasın.
const progressShare = ( position ) =>
	`${ Math.round( ( ( position.index + 1 ) / position.total ) * 10000 ) / 100 }%`;

const progressText = ( position ) =>
	sprintf(
		/* translators: 1: current step number. 2: total number of steps. */
		__( 'Step %1$d of %2$d', 'quoteform' ),
		position.index + 1,
		position.total
	);

const announcement = ( position, formatted ) =>
	formatted === null
		? sprintf(
				/* translators: 1: current step number. 2: total number of steps. */
				__( 'Step %1$d of %2$d.', 'quoteform' ),
				position.index + 1,
				position.total
		  )
		: sprintf(
				/* translators: 1: current step number. 2: total number of steps. 3: formatted total. */
				__( 'Step %1$d of %2$d. Total %3$s.', 'quoteform' ),
				position.index + 1,
				position.total,
				formatted
		  );

const isLastStep = ( position ) => position.index > -1 && position.index === position.total - 1;

export function createForm( container, schema, options = {} ) {
	const formId = container.getAttribute( 'data-quoteform' ) || '';
	const fields = schema.fields || {};
	const steps = Array.isArray( schema.steps ) ? schema.steps : [];
	const settings = schema.settings || {};

	const state = createState( schema );
	const controls = {};
	const stepHosts = {};
	const stepHeadings = {};
	const stepHeaders = {};
	const detachers = [];

	// Bu mount-un id fəzası. Kökün öz `id`-si olması təsadüfi deyil: hər sahənin
	// `id`-si, `label[for]`-u və `aria-describedby`-ı ondan törəyir, yəni
	// namespace səhifədə oxunan bir şeydir, gizli bir sayğac deyil.
	const namespace = nextNamespace( formId );

	const root = document.createElement( 'div' );
	root.className = 'quoteform';
	root.id = namespace;

	const progress = document.createElement( 'p' );
	progress.className = 'quoteform_progress';
	progress.setAttribute( 'data-quoteform-progress', '' );
	root.appendChild( progress );

	// Xətt yalnız vizualdır — eyni məlumatı yuxarıdakı mətn onsuz da deyir.
	// Mətnin İÇİNƏ qoyulmur: `progress.textContent` hər addımda yenidən yazılır
	// və uşaq elementləri silərdi.
	const progressBar = document.createElement( 'div' );
	progressBar.className = 'quoteform_progress_bar';
	progressBar.setAttribute( 'aria-hidden', 'true' );
	root.appendChild( progressBar );

	const stepsHost = document.createElement( 'div' );
	stepsHost.className = 'quoteform_steps';
	root.appendChild( stepsHost );

	const emptyHost = document.createElement( 'div' );
	emptyHost.className = 'quoteform_empty';
	root.appendChild( emptyHost );

	const emptyNote = document.createElement( 'p' );
	emptyNote.className = 'quoteform_empty_note';
	emptyNote.setAttribute( 'data-quoteform-empty', '' );
	emptyNote.textContent = __( 'There is nothing to fill in right now.', 'quoteform' );

	const { summary, breakdown, total } = buildSummary();
	root.appendChild( summary );

	const navHost = document.createElement( 'div' );
	navHost.className = 'quoteform_nav';
	root.appendChild( navHost );

	const announcer = createAnnouncer( root );

	const backButton = navButton( 'back', __( 'Back', 'quoteform' ) );
	const nextButton = navButton( 'next', __( 'Next', 'quoteform' ) );

	const config = typeof window !== 'undefined' ? window.quoteformConfig : undefined;
	const client =
		options.client ||
		( config && typeof config.restUrl === 'string' ? createClient( { restUrl: config.restUrl, formId } ) : null );
	const navigate = options.navigate || ( ( url ) => window.location.assign( url ) );
	const submitUi = createSubmitUi( { label: settings.submit_label } );
	const honeypot = buildHoneypot( namespace );
	const failureMessage = __( 'We couldn’t send your quote. Please try again.', 'quoteform' );
	let submitting = false;
	let finished = false;
	let destroyed = false;

	root.insertBefore( submitUi.banner, navHost );
	root.appendChild( honeypot.element );

	// Sessiya forma açılan kimi alınır ki, ticket göndərişə qədər "yaşlansın".
	// Uğursuzluq burada udulur: `submit()` sessiyanı özü yenidən istəyir.
	if ( client ) {
		client.ensureSession().catch( () => {} );
	}

	steps.forEach( ( step ) => {
		const host = document.createElement( 'div' );
		host.className = 'quoteform_step';
		host.setAttribute( 'data-quoteform-step', step.key );
		stepHosts[ step.key ] = host;

		const header = buildStepHeader( step );
		stepHeadings[ step.key ] = header.heading;
		stepHeaders[ step.key ] = header.nodes;

		( step.fields || [] ).forEach( ( key ) => {
			const field = fields[ key ];
			const control = field ? buildControl( field, namespace ) : null;

			if ( ! control ) {
				return;
			}

			applyValue( control, field, state.get()[ key ] );
			detachers.push(
				bindControl( control, field, ( value ) => {
					control.setError( null );
					state.set( key, value );
				} )
			);
			controls[ key ] = control;
		} );
	} );

	// Cari addım AÇAR ilə saxlanılır, indeks ilə yox: görünürlük dəyişən anda
	// indeks artıq başqa addıma işarə edir — məhz dəyişməməli olduğu anda.
	let currentKey = steps.length ? steps[ 0 ].key : null;
	let painted = false;

	function paintFields( visible ) {
		steps.forEach( ( step ) => {
			reconcile( stepHosts[ step.key ], [
				...stepHeaders[ step.key ],
				...( step.fields || [] )
					.filter( ( key ) => controls[ key ] && visible.fields.has( key ) )
					.map( ( key ) => controls[ key ].wrapper ),
			] );
		} );
	}

	function paintStep() {
		const host = currentKey === null ? null : stepHosts[ currentKey ];

		reconcile( stepsHost, host ? [ host ] : [] );
		reconcile( emptyHost, host ? [] : [ emptyNote ] );
	}

	function paintNavigation( position ) {
		const active = position.index > -1;

		progress.hidden = ! active;
		progress.textContent = active ? progressText( position ) : '';
		progressBar.hidden = ! active;
		progressBar.style.setProperty( '--quoteform-progress', active ? progressShare( position ) : '0%' );

		reconcile( navHost, [
			...( active && position.index > 0 ? [ backButton ] : [] ),
			...( active && position.index < position.total - 1 ? [ nextButton ] : [] ),
			...( active && isLastStep( position ) ? [ submitUi.button ] : [] ),
		] );
	}

	// Yekun MƏBLƏĞ hər addımda görünür — canlı qiymət bu pluginin bütün mənası.
	// Açılış (breakdown) isə yalnız SON görünən addımda (§9): aralıq addımda o,
	// ziyarətçinin hələ cavablamadığı sətirləri qiymət kimi göstərərdi.
	function paintSummary( result, formatted, withBreakdown ) {
		summary.hidden = formatted === null;
		total.hidden = formatted === null;
		total.textContent = formatted === null ? '' : formatted;

		breakdown.hidden = formatted === null || ! withBreakdown;
		breakdown.textContent = '';

		if ( ! breakdown.hidden ) {
			result.breakdown.forEach( ( row ) => breakdown.appendChild( breakdownRow( row ) ) );
		}
	}

	function focusStep() {
		const heading = currentKey === null ? null : stepHeadings[ currentKey ];

		if ( heading ) {
			heading.focus();
		}
	}

	function refresh() {
		if ( finished ) {
			return;
		}

		const values = state.get();
		const visible = resolveVisibility( schema, values );
		const available = visibleSteps( schema, visible );
		const settled = settleStep( schema, available, currentKey );
		const relocated = settled !== currentKey;

		currentKey = settled;

		const position = stepPosition( available, currentKey );
		const result = calculate( schema, variablesFor( schema, values, visible.fields ) );
		const broken = result.error !== null || result.total === null;
		const formatted = broken ? null : formatMoney( result.total, settings );

		paintFields( visible );
		paintStep();
		paintNavigation( position );
		paintSummary( result, formatted, isLastStep( position ) );

		// İlk boyamada elan EDİLMİR: ziyarətçi hələ heç nəyə toxunmayıb, səhifə
		// açılan kimi danışan canlı sahə yalnız maneədir.
		if ( painted && position.index > -1 ) {
			announcer.announce( announcement( position, formatted ) );
		}

		if ( relocated && painted ) {
			focusStep();
		}

		painted = true;
	}

	function showErrors( step, errors ) {
		( step.fields || [] ).forEach( ( key ) => {
			if ( controls[ key ] ) {
				controls[ key ].setError( errors[ key ] || null );
			}
		} );
	}

	// Fokus step-in öz sahə sırası ilə axtarılır — DOM sırası ilə üst-üstə düşsə
	// də. `input`-u olmayan nəzarət (seçimsiz qrup) ötürülür, yoxsa fokus heç yerə
	// getməz və ziyarətçi problemi tapa bilməzdi. `hidden`/`html` üçün ayrıca
	// yoxlama YOXDUR: `validateStep` o tipləri heç vaxt xətalar siyahısına salmır.
	function firstInvalidInput( step, errors ) {
		const key = ( step.fields || [] ).find(
			( candidate ) => errors[ candidate ] && controls[ candidate ] && controls[ candidate ].input
		);

		return key ? controls[ key ].input : null;
	}

	function mayLeave( available, key, values, visible ) {
		const step = available.find( ( candidate ) => candidate.key === key );

		if ( ! step ) {
			return true;
		}

		const errors = validateStep( schema, step, values, visible );

		showErrors( step, errors );

		const invalid = firstInvalidInput( step, errors );

		if ( invalid ) {
			invalid.focus();
		}

		// Nəzarəti ümumiyyətlə qurulmayan sahə (tanınmayan tip → `buildControl`
		// `null` qaytarır) Next-i bloklaya BİLMƏZ: mesaj göstərəcək yer yoxdur,
		// ziyarətçi isə görmədiyi sahəni düzəldə bilmir. Seçimsiz qrup isə
		// bloklayır — onun `setError`-u xəta abzasını yazır, yalnız fokuslanası
		// input-u yoxdur.
		return ! Object.keys( errors ).some( ( key ) => controls[ key ] );
	}

	function move( offset ) {
		const values = state.get();
		const visible = resolveVisibility( schema, values );
		const available = visibleSteps( schema, visible );
		const from = settleStep( schema, available, currentKey );
		const target = available[ stepPosition( available, from ).index + offset ];

		if ( ! target ) {
			return;
		}

		// Yalnız irəli gediş yoxlanılır: geri qayıdan ziyarətçini doldurmadığı
		// sahəyə görə saxlamaq onu addımda tələyə salardı.
		if ( offset > 0 && ! mayLeave( available, from, values, visible ) ) {
			return;
		}

		currentKey = target.key;
		refresh();
		focusStep();
	}

	function showServerErrors( errors, stepKey ) {
		const values = state.get();
		const visible = resolveVisibility( schema, values );
		const available = visibleSteps( schema, visible );
		const onPage = Object.keys( errors ).some(
			( key ) => controls[ key ] && visible.fields.has( key ) && available.some( ( step ) => ( step.fields || [] ).includes( key ) )
		);

		// R15 müdafiəsi: server ziyarətçinin görmədiyi (və ya formada olmayan)
		// sahəni adlandırırsa, göstəriləsi və fokuslanası yer yoxdur — susub
		// fokusu itirmək əvəzinə ümumi uğursuzluq yolu (fokus + məcburi elan).
		if ( ! onPage ) {
			fail();
			return;
		}

		if ( stepKey && available.some( ( step ) => step.key === stepKey ) ) {
			currentKey = stepKey;
		}

		refresh();

		Object.keys( controls ).forEach( ( key ) => controls[ key ].setError( errors[ key ] || null ) );

		const step = available.find( ( candidate ) => candidate.key === currentKey );
		const invalid = step ? firstInvalidInput( step, errors ) : null;

		if ( invalid ) {
			invalid.focus();
		} else {
			focusStep();
		}

		const count = Object.keys( errors ).length;

		announcer.announce(
			sprintf(
				/* translators: %d: how many answers the server rejected. */
				_n( '%d field needs attention.', '%d fields need attention.', count, 'quoteform' ),
				count
			)
		);
	}

	function showSuccess( body ) {
		finished = true;

		Array.from( root.children ).forEach( ( child ) => {
			if ( child.getAttribute( 'role' ) !== 'status' ) {
				child.hidden = true;
			}
		} );

		const panel = buildSuccessPanel( body );

		root.appendChild( panel );
		panel.focus();
		announcer.announce( panel.querySelector( '.quoteform_success_message' ).textContent );
	}

	// Elan məcburidir: zolağın rolu yoxdur (R1), announcer isə təkrar mesajı
	// udur — ikinci eyni uğursuzluq ekran oxuyucuya səssiz keçərdi. Fokus
	// düyməyə qayıdır: `disabled` olmuş düymə fokusu itirmişdi (<body>-yə).
	function fail() {
		submitUi.showError( failureMessage );
		announcer.announce( failureMessage, { force: true } );
		submitUi.button.focus();
	}

	// Yalnız http(s) — `javascript:` və s. ünvanlara keçid edilmir.
	const isSafeRedirect = ( url ) => typeof url === 'string' && /^https?:\/\//i.test( url );

	async function onSubmit() {
		if ( submitting || finished ) {
			return;
		}

		const values = state.get();
		const visible = resolveVisibility( schema, values );
		const available = visibleSteps( schema, visible );
		const from = settleStep( schema, available, currentKey );

		if ( ! mayLeave( available, from, values, visible ) ) {
			return;
		}

		submitUi.showError( null );

		if ( ! client ) {
			fail();
			return;
		}

		// İkinci klik (və ya Enter) gözləyən göndərişin üstünə yeni sorğu
		// göndərmir: client özü təkrarı bloklamır, qoruyucu buradadır.
		submitting = true;
		submitUi.setBusy( true );
		announcer.announce( __( 'Sending…', 'quoteform' ) );

		let result;

		try {
			result = await client.submit( values, honeypot.input.value );
		} catch ( error ) {
			result = { status: 0, body: null };
		}

		submitting = false;

		// Cavab gələnə qədər forma sökülübsə, heç nəyə toxunulmur.
		if ( destroyed ) {
			return;
		}

		if ( result.status === 201 && result.body ) {
			// R12: yönləndirmədə forma bitmiş sayılır və düymə bağlı QALIR —
			// naviqasiya gecikərsə, ikinci klik ikinci POST göndərməməlidir.
			if ( result.body.success_action === 'redirect' && isSafeRedirect( result.body.redirect_url ) ) {
				finished = true;
				navigate( result.body.redirect_url );
				return;
			}

			submitUi.setBusy( false );
			showSuccess( result.body );
			return;
		}

		submitUi.setBusy( false );

		if ( result.status === 422 && result.body && result.body.errors ) {
			showServerErrors( result.body.errors, result.body.step );
			return;
		}

		fail();
	}

	const onSubmitClick = () => {
		onSubmit();
	};

	submitUi.button.addEventListener( 'click', onSubmitClick );
	detachers.push( () => submitUi.button.removeEventListener( 'click', onSubmitClick ) );

	const onBack = () => move( -1 );
	const onNext = () => move( 1 );

	backButton.addEventListener( 'click', onBack );
	nextButton.addEventListener( 'click', onNext );

	detachers.push( () => backButton.removeEventListener( 'click', onBack ) );
	detachers.push( () => nextButton.removeEventListener( 'click', onNext ) );

	let timer = null;

	// Gecikdirilən YALNIZ yenidən hesablamadır — dəyər state-ə dərhal yazılır,
	// yoxsa bu 50ms ərzində state-i oxuyan hər kəs köhnə qiymət görərdi.
	const unsubscribe = state.subscribe( () => {
		if ( timer !== null ) {
			clearTimeout( timer );
		}

		timer = setTimeout( () => {
			timer = null;
			refresh();
		}, DEBOUNCE_MS );
	} );

	container.textContent = '';
	container.appendChild( root );
	refresh();

	return {
		destroy() {
			destroyed = true;

			if ( timer !== null ) {
				clearTimeout( timer );
				timer = null;
			}

			unsubscribe();
			announcer.destroy();
			detachers.forEach( ( detach ) => detach() );
			container.textContent = '';
		},
		getState: state.get,
		refresh,
	};
}
