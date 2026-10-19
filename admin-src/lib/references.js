import { sprintf, __ } from '@wordpress/i18n';

import { expressionVariables } from '../../frontend-src/engine';

/**
 * İfadədə `{rooms}` alt-sətrini axtarmaq `{rooms.price}`-ı buraxar,
 * sadəcə `rooms` axtarmaq isə `{bedrooms}`-u tutar. Ona görə mühərrikin
 * ÖZ `expressionVariables()` funksiyası işlədilir və hər dəyişənin
 * nöqtədən əvvəlki hissəsi müqayisə edilir.
 */
function expressionUsesKey( expression, key ) {
	if ( typeof expression !== 'string' ) {
		return false;
	}

	try {
		return expressionVariables( expression ).some(
			( name ) => String( name ).split( '.' )[ 0 ] === key
		);
	} catch ( error ) {
		return false;
	}
}

export function fieldReferences( schema, key ) {
	const found = [];

	( Array.isArray( schema.steps ) ? schema.steps : [] ).forEach( ( step ) => {
		if ( ! step || typeof step !== 'object' || ! Array.isArray( step.fields ) ) {
			return;
		}

		if ( step.fields.includes( key ) ) {
			found.push(
				sprintf(
					/* translators: %s: step title or key. */
					__( 'the step “%s”', 'quoteform' ),
					step.title || step.key || ''
				)
			);
		}
	} );

	( Array.isArray( schema.calculations ) ? schema.calculations : [] ).forEach( ( calculation ) => {
		if ( ! calculation || typeof calculation !== 'object' ) {
			return;
		}

		if ( expressionUsesKey( calculation.expression, key ) ) {
			found.push(
				sprintf(
					/* translators: %s: calculation key. */
					__( 'the calculation “%s”', 'quoteform' ),
					calculation.key || ''
				)
			);
		}
	} );

	( Array.isArray( schema.rules ) ? schema.rules : [] ).forEach( ( rule, index ) => {
		if ( ! rule || typeof rule !== 'object' ) {
			return;
		}

		const target = rule.target;
		const targetsIt =
			target && typeof target === 'object' && target.kind === 'field' && target.key === key;

		const conditions = Array.isArray( rule.conditions ) ? rule.conditions : [];
		const testsIt = conditions.some(
			( condition ) => condition && typeof condition === 'object' && condition.field === key
		);

		if ( targetsIt || testsIt ) {
			found.push(
				sprintf(
					/* translators: %d: rule number, starting at one. */
					__( 'rule %d', 'quoteform' ),
					index + 1
				)
			);
		}
	} );

	return found;
}
