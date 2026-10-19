import { useBlockProps } from '@wordpress/block-editor';
import { useInstanceId } from '@wordpress/compose';
import { useEffect, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import SelectControl from '../components/SelectControl';
import { listForms } from '../api/client';

const PER_PAGE = 100;

// Siyahı səhifələnir. Hədd qoyulur ki, cavabdakı `totalPages` gözlənilməz
// gəlsə belə, redaktor sonsuz sorğu döngəsinə düşməsin.
const MAX_PAGES = 20;

async function loadForms() {
	const collected = [];
	let page = 1;
	let pages = 1;

	while ( page <= pages && page <= MAX_PAGES ) {
		// eslint-disable-next-line no-await-in-loop
		const result = await listForms( { page, perPage: PER_PAGE } );

		collected.push( ...result.forms );
		pages = result.totalPages > 0 ? result.totalPages : 1;
		page++;
	}

	return collected;
}

/**
 * Kətanda formanın ÖZÜ göstərilmir, adı göstərilir.
 *
 * `ServerSideRender` burada heç nə qazandırmazdı: `render_callback` yalnız
 * boş bir konteyner və `<noscript>` qaytarır, formanı isə `build/frontend.js`
 * `window.quoteformData`-dan qurur. Həmin skript də, sxem də
 * `/wp/v2/block-renderer` cavabına DÜŞMÜR, yəni redaktor hər düymə
 * basılışında bir sorğu ödəyib boş qutu göstərərdi.
 */
export default function Edit( { attributes, setAttributes } ) {
	const blockProps = useBlockProps( { className: 'quoteform_block' } );

	// `block.json` `"multiple": true` verir, yəni bu blok bir yazıda dəfələrlə
	// ola bilər. Sabit `id` o zaman təkrarlanar və `<label for>` yad blokun
	// seçiminə bağlanardı — ona görə nömrəni redaktorun özü verir.
	const chooserId = useInstanceId( Edit, 'quoteform_block-form' );
	const [ forms, setForms ] = useState( null );
	const [ failed, setFailed ] = useState( false );

	useEffect( () => {
		let cancelled = false;

		loadForms().then(
			( loaded ) => {
				if ( ! cancelled ) {
					setForms( loaded );
				}
			},
			() => {
				if ( ! cancelled ) {
					setForms( [] );
					setFailed( true );
				}
			}
		);

		return () => {
			cancelled = true;
		};
	}, [] );

	const formId = Number( attributes.formId ) || 0;
	const chosen = forms === null ? null : forms.find( ( form ) => form.id === formId ) || null;

	return (
		<div { ...blockProps }>
			<p className="quoteform_block__name">
				<span className="dashicons dashicons-calculator" aria-hidden="true" />
				{ __( 'Quote form', 'quoteform' ) }
			</p>

			{ failed && (
				<p className="quoteform_block__problem">
					{ __(
						'Your forms could not be loaded. Editing forms needs the “qform_manage_forms” capability.',
						'quoteform'
					) }
				</p>
			) }

			{ forms === null && <p>{ __( 'Looking for your forms…', 'quoteform' ) }</p> }

			{ forms !== null && ! failed && forms.length === 0 && (
				<p className="quoteform_block__problem">
					{ __(
						'There are no forms to show yet. Open Quoteform in the admin menu and create one.',
						'quoteform'
					) }
				</p>
			) }

			{ forms !== null && forms.length > 0 && (
				<SelectControl
					id={ chooserId }
					label={ __( 'Which form?', 'quoteform' ) }
					value={ formId === 0 ? '' : String( formId ) }
					placeholder={ __( 'Choose a form…', 'quoteform' ) }
					options={ forms.map( ( form ) => ( {
						value: String( form.id ),
						label: form.title,
					} ) ) }
					onChange={ ( value ) => setAttributes( { formId: Number( value ) } ) }
				/>
			) }

			{ chosen !== null && (
				<p className="quoteform_block__chosen">
					{ sprintf(
						/* translators: %s: the title of the chosen form. */
						__( 'Visitors will see “%s” here.', 'quoteform' ),
						chosen.title
					) }
				</p>
			) }

			{ forms !== null && ! failed && formId > 0 && chosen === null && (
				<p className="quoteform_block__problem">
					{ sprintf(
						/* translators: %d: the id of a form that is no longer available. */
						__(
							'This block points at form %d, which is no longer available. Nothing will be shown to visitors.',
							'quoteform'
						),
						formId
					) }
				</p>
			) }
		</div>
	);
}
