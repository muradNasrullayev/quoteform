import { useEffect, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { compileExpression, expressionVariables } from '../../frontend-src/engine';
import ControlLabel from '../components/ControlLabel';
import FieldError from '../components/FieldError';
import { suggestName } from '../lib/suggest';

const MAX_LENGTH = 1000;
const DEBOUNCE_MS = 150;

function classify( name, knownVariables, priceVariables ) {
	const text = String( name );
	const dot = text.indexOf( '.' );

	if ( dot === -1 ) {
		return knownVariables.includes( text ) ? 'ok' : 'unknown';
	}

	const base = text.slice( 0, dot );

	if ( ! knownVariables.includes( base ) ) {
		return 'unknown';
	}

	return text.slice( dot + 1 ) === 'price' && priceVariables.includes( base ) ? 'ok' : 'suffix';
}

function inspect( source, knownVariables, priceVariables ) {
	if ( source.trim() === '' ) {
		return { status: 'empty', message: __( 'A calculation needs a formula.', 'quoteform' ) };
	}

	if ( source.length > MAX_LENGTH ) {
		return {
			status: 'error',
			message: sprintf(
				/* translators: 1: current length, 2: maximum length. */
				__( 'This formula is too long: %1$d characters, and the limit is %2$d.', 'quoteform' ),
				source.length,
				MAX_LENGTH
			),
		};
	}

	try {
		compileExpression( source );
	} catch ( error ) {
		return {
			status: 'error',
			message: sprintf(
				/* translators: 1: engine error code, 2: character position. */
				__( 'This formula is not valid (%1$s) at character %2$d.', 'quoteform' ),
				error.codeSlug,
				error.position
			),
		};
	}

	const unknown = [];
	const badSuffix = [];

	expressionVariables( source ).forEach( ( name ) => {
		const verdict = classify( name, knownVariables, priceVariables );

		if ( verdict === 'unknown' ) {
			unknown.push( String( name ) );
		} else if ( verdict === 'suffix' ) {
			badSuffix.push( String( name ) );
		}
	} );

	if ( unknown.length > 0 ) {
		// Təklif YALNIZ tək naməlum ad olanda verilir: iki ad səhvdirsə,
		// hansının hansına aid olduğunu göstərmədən "bunu nəzərdə tutdunuz?"
		// demək mesajı aydınlaşdırmır, qarışdırır.
		const suggestion =
			unknown.length === 1
				? suggestName( unknown[ 0 ], [
						...knownVariables,
						...priceVariables.map( ( name ) => `${ name }.price` ),
				  ] )
				: null;

		if ( suggestion !== null ) {
			return {
				status: 'error',
				message: sprintf(
					/* translators: 1: the name written in the formula, 2: the existing name it is probably a typo of. */
					__( 'There is no “%1$s” in this form — did you mean “%2$s”?', 'quoteform' ),
					unknown[ 0 ],
					suggestion
				),
			};
		}

		return {
			status: 'error',
			message: sprintf(
				/* translators: %s: comma-separated variable names. */
				__( 'This formula uses something the form does not have: %s.', 'quoteform' ),
				unknown.join( ', ' )
			),
		};
	}

	if ( badSuffix.length > 0 ) {
		return {
			status: 'error',
			message: sprintf(
				/* translators: %s: comma-separated variable names. */
				__(
					'Only “.price” works here, and only on a dropdown, radio or checkbox field: %s.',
					'quoteform'
				),
				badSuffix.join( ', ' )
			),
		};
	}

	return { status: 'ok', message: __( 'This formula is valid.', 'quoteform' ) };
}

export default function FormulaEditor( {
	id,
	label,
	value,
	onChange,
	knownVariables,
	priceVariables = [],
	errors = [],
	visibleLabel,
} ) {
	const [ verdict, setVerdict ] = useState( null );

	/**
	 * `knownVariables` valideyndə `.filter()` ilə qurulur, yəni HƏR render-də
	 * təzə massivdir. Onu birbaşa asılılıq kimi yazsaq, panelin istənilən
	 * yenidən render-i bütün sətirlərin debounce taymerini sıfırlayar. Massivin
	 * MƏZMUNU isə sabitdir — ona görə asılılıq məzmundan düzəlir.
	 */
	const variablesKey = `${ knownVariables.join( '\u0000' ) }\u0001${ priceVariables.join(
		'\u0000'
	) }`;

	useEffect( () => {
		const timer = setTimeout(
			() => setVerdict( inspect( value, knownVariables, priceVariables ) ),
			DEBOUNCE_MS
		);

		return () => clearTimeout( timer );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ value, variablesKey ] );

	const hasServerErrors = errors.length > 0;
	const errorId = `${ id }-error`;
	const verdictId = `${ id }-verdict`;
	const showsVerdict = ! hasServerErrors && verdict !== null;

	return (
		<div className="quoteform_formula">
			<ControlLabel htmlFor={ id } label={ label } visibleLabel={ visibleLabel } />
			<textarea
				id={ id }
				className="quoteform_formula__input"
				value={ value }
				spellCheck="false"
				aria-invalid={ hasServerErrors ? 'true' : undefined }
				aria-describedby={ hasServerErrors ? errorId : showsVerdict ? verdictId : undefined }
				onChange={ ( event ) => onChange( event.target.value ) }
			/>

			<FieldError id={ errorId } errors={ errors } />

			{ showsVerdict && (
				<p
					className={ `quoteform_formula__verdict is-${ verdict.status }` }
					id={ verdictId }
					role="status"
				>
					{ verdict.message }
				</p>
			) }

			<details className="quoteform_formula__help">
				<summary>{ __( 'What can I use here?', 'quoteform' ) }</summary>
				<p>
					{ __(
						'Numbers, + - * / and ( ), comparisons, and functions like round(), min(), max(), if(), contains() and is_empty().',
						'quoteform'
					) }
				</p>
				<ul>
					{ knownVariables.map( ( name ) => (
						<li key={ name }>{ `{${ name }}` }</li>
					) ) }
					{ priceVariables.map( ( name ) => (
						<li key={ `${ name }.price` }>{ `{${ name }.price}` }</li>
					) ) }
				</ul>
			</details>
		</div>
	);
}
