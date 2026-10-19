import { evaluateAllCalculations } from '../engine';

import { formatMoney } from './format';

const TOTAL_KEY = 'total';

export function calculate( schema, variables ) {
	const calculations = Array.isArray( schema.calculations )
		? schema.calculations.filter( ( calculation ) => calculation !== null && typeof calculation === 'object' )
		: [];
	const settings = schema.settings || {};

	let values;

	try {
		values = evaluateAllCalculations( calculations, variables );
	} catch ( error ) {
		return {
			values: null,
			total: null,
			breakdown: [],
			error: error && error.codeSlug ? error.codeSlug : 'calculation_failed',
		};
	}

	const total = typeof values[ TOTAL_KEY ] === 'number' ? values[ TOTAL_KEY ] : null;

	const breakdown = calculations
		.filter( ( calculation ) => calculation.visible === true )
		.map( ( calculation ) => ( {
			key: calculation.key,
			label: calculation.label,
			amount: typeof values[ calculation.key ] === 'number' ? values[ calculation.key ] : null,
			formatted: formatMoney( values[ calculation.key ], settings ),
		} ) );

	return { values, total, breakdown, error: null };
}
