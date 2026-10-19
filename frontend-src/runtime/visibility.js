import { ruleFires } from './conditions';
import { variablesFor } from './values';

const MAX_PASSES = 10;

function initialState( schema ) {
	const fields = new Set( Object.keys( schema.fields || {} ) );
	const steps = new Set( ( schema.steps || [] ).map( ( step ) => step.key ) );
	// PHP `$field['required'] ?? null` heç vaxt xəta vermir, `null` sahə tərifi
	// üçün belə — burada da eyni cür tolerantlıq lazımdır (Ruling R3).
	const required = new Set(
		Object.keys( schema.fields || {} ).filter(
			( key ) => schema.fields[ key ] && schema.fields[ key ].required === true
		)
	);

	return { fields, steps, required };
}

function applyRules( schema, variables, resolved ) {
	( schema.rules || [] ).forEach( ( rule ) => {
		const target = rule.target || {};

		if ( typeof target.key !== 'string' ) {
			return;
		}

		const isField = target.kind === 'field';
		const collection = isField ? resolved.fields : resolved.steps;
		const fields = schema.fields || {};
		const exists = isField
			? Object.prototype.hasOwnProperty.call( fields, target.key ) &&
				fields[ target.key ] !== null &&
				typeof fields[ target.key ] === 'object'
			: ( schema.steps || [] ).some( ( step ) => step.key === target.key );

		if ( ! exists || ! ruleFires( rule, variables, schema ) ) {
			return;
		}

		if ( rule.action === 'show' ) {
			collection.add( target.key );
		} else if ( rule.action === 'hide' ) {
			collection.delete( target.key );
		} else if ( isField && rule.action === 'require' ) {
			resolved.required.add( target.key );
		} else if ( isField && rule.action === 'optional' ) {
			resolved.required.delete( target.key );
		}
	} );
}

function dropHiddenSteps( schema, resolved ) {
	( schema.steps || [] ).forEach( ( step ) => {
		if ( resolved.steps.has( step.key ) ) {
			return;
		}

		( step.fields || [] ).forEach( ( key ) => resolved.fields.delete( key ) );
	} );
}

// Görünməyən sahə heç vaxt required ola bilməz — istər `hide` qaydası
// birbaşa sahəni hədəf alsın, istər onu ehtiva edən step-i.
function dropRequiredForHiddenFields( resolved ) {
	[ ...resolved.required ].forEach( ( key ) => {
		if ( ! resolved.fields.has( key ) ) {
			resolved.required.delete( key );
		}
	} );
}

function signature( resolved ) {
	return [
		[ ...resolved.fields ].sort().join( ',' ),
		[ ...resolved.steps ].sort().join( ',' ),
		[ ...resolved.required ].sort().join( ',' ),
	].join( '|' );
}

// Hər keçid schema-nın öz defaultlarından yenidən qurulur və əvvəlki keçidin
// dəyişənləri üzərində bütün qaydaları təzədən tətbiq edir — silinmələri
// yığmaq əvəzinə. Əks halda `show` heç vaxt əvvəlki keçidin `hide`-ını ləğv
// edə bilməzdi.
export function resolveVisibility( schema, state ) {
	let resolved = initialState( schema );
	let previous = '';

	for ( let pass = 0; pass < MAX_PASSES; pass++ ) {
		const variables = variablesFor( schema, state, resolved.fields );

		resolved = initialState( schema );
		applyRules( schema, variables, resolved );
		dropHiddenSteps( schema, resolved );
		dropRequiredForHiddenFields( resolved );

		const current = signature( resolved );

		if ( current === previous ) {
			return resolved;
		}

		previous = current;
	}

	// eslint-disable-next-line no-console
	console.warn( '[quoteform] visibility did not settle; using the last state.' );

	return resolved;
}
