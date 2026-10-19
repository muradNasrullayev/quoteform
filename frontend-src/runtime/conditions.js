import { evaluateExpression } from '../engine';
import { normaliseConditionValue } from './values';

const VALUE = '__value';

const SOURCES = {
	equals: `{%s} == {${ VALUE }}`,
	not_equals: `{%s} != {${ VALUE }}`,
	greater: `{%s} > {${ VALUE }}`,
	greater_or_equal: `{%s} >= {${ VALUE }}`,
	less: `{%s} < {${ VALUE }}`,
	less_or_equal: `{%s} <= {${ VALUE }}`,
	contains: `contains({%s}, {${ VALUE }})`,
	not_contains: `!contains({%s}, {${ VALUE }})`,
	is_empty: 'is_empty({%s})',
	is_not_empty: '!is_empty({%s})',
};

function resolveValue( condition, schema ) {
	if ( condition.value === undefined ) {
		return '';
	}

	const field = schema && schema.fields ? schema.fields[ condition.field ] : undefined;

	return field ? normaliseConditionValue( field, condition.value ) : condition.value;
}

export function conditionHolds( condition, variables, schema ) {
	if ( ! condition || typeof condition !== 'object' || typeof condition.field !== 'string' ) {
		return false;
	}

	const template = SOURCES[ condition.operator ];

	if ( ! template ) {
		return false;
	}

	const source = template.replace( '%s', condition.field );

	try {
		return Boolean(
			evaluateExpression( source, {
				...variables,
				[ VALUE ]: resolveValue( condition, schema ),
			} )
		);
	} catch ( error ) {
		return false;
	}
}

export function ruleFires( rule, variables, schema ) {
	const conditions = Array.isArray( rule.conditions ) ? rule.conditions : [];

	if ( conditions.length === 0 ) {
		return false;
	}

	if ( rule.match === 'any' ) {
		return conditions.some( ( condition ) => conditionHolds( condition, variables, schema ) );
	}

	return conditions.every( ( condition ) => conditionHolds( condition, variables, schema ) );
}
