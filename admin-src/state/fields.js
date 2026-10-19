import { __ } from '@wordpress/i18n';

import { isReservedKey, isValidKey, slugify, uniqueKey } from '../lib/keys';
import { ADD_FIELD, REMOVE_FIELD, RENAME_FIELD, UPDATE_FIELD } from './actions';

export const FIELD_TYPES = [
	'number',
	'text',
	'email',
	'tel',
	'textarea',
	'select',
	'radio',
	'checkbox',
	'toggle',
	'date',
	'slider',
	'hidden',
	'html',
];

/** `FieldValidator::TYPE_KEYS`-in eynisi. */
export const TYPE_EXTRA_KEYS = {
	number: [ 'min', 'max', 'step' ],
	text: [],
	email: [],
	tel: [],
	textarea: [],
	select: [ 'options' ],
	radio: [ 'options' ],
	checkbox: [ 'options' ],
	toggle: [],
	date: [],
	slider: [ 'min', 'max', 'step' ],
	hidden: [],
	html: [ 'content' ],
};

export const LABEL_OPTIONAL_TYPES = [ 'hidden', 'html' ];

/** `CalculationValidator::PRICE_BEARING_TYPES`-in eynisi (spec §7.3). */
export const PRICE_BEARING_TYPES = [ 'select', 'radio', 'checkbox' ];

export const TYPE_LABELS = {
	number: __( 'Number', 'quoteform' ),
	text: __( 'Text', 'quoteform' ),
	email: __( 'Email', 'quoteform' ),
	tel: __( 'Phone', 'quoteform' ),
	textarea: __( 'Multi-line text', 'quoteform' ),
	select: __( 'Dropdown', 'quoteform' ),
	radio: __( 'Radio buttons', 'quoteform' ),
	checkbox: __( 'Checkboxes', 'quoteform' ),
	toggle: __( 'Toggle', 'quoteform' ),
	date: __( 'Date', 'quoteform' ),
	slider: __( 'Slider', 'quoteform' ),
	hidden: __( 'Hidden', 'quoteform' ),
	html: __( 'HTML block', 'quoteform' ),
};

function defaultValueFor( type ) {
	if ( type === 'number' || type === 'slider' ) {
		return 0;
	}

	if ( type === 'toggle' ) {
		return false;
	}

	if ( type === 'checkbox' ) {
		return [];
	}

	return '';
}

export function defaultField( type, key, label ) {
	if ( ! Object.prototype.hasOwnProperty.call( TYPE_EXTRA_KEYS, type ) ) {
		return null;
	}

	const field = {
		key,
		type,
		label,
		help: '',
		placeholder: '',
		required: false,
		default: defaultValueFor( type ),
	};

	TYPE_EXTRA_KEYS[ type ].forEach( ( extra ) => {
		if ( extra === 'min' ) {
			field.min = 0;
		} else if ( extra === 'max' ) {
			field.max = 100;
		} else if ( extra === 'step' ) {
			field.step = 1;
		} else if ( extra === 'options' ) {
			field.options = [
				{ label: __( 'First option', 'quoteform' ), value: 'option_1', price: 0 },
			];
		} else if ( extra === 'content' ) {
			field.content = __( 'Write something here.', 'quoteform' );
		}
	} );

	return field;
}

export function fieldsReducer( fields, action ) {
	switch ( action.type ) {
		case ADD_FIELD: {
			const label = __( 'New field', 'quoteform' );
			const key = uniqueKey( slugify( action.fieldType ), Object.keys( fields ) );
			const field = defaultField( action.fieldType, key, label );

			if ( field === null ) {
				return fields;
			}

			return { ...fields, [ key ]: field };
		}

		case UPDATE_FIELD: {
			if ( ! Object.prototype.hasOwnProperty.call( fields, action.key ) ) {
				return fields;
			}

			return { ...fields, [ action.key ]: { ...fields[ action.key ], ...action.patch } };
		}

		case REMOVE_FIELD: {
			if ( ! Object.prototype.hasOwnProperty.call( fields, action.key ) ) {
				return fields;
			}

			const next = { ...fields };

			delete next[ action.key ];

			return next;
		}

		case RENAME_FIELD: {
			if ( action.oldKey === action.newKey ) {
				return fields;
			}

			if ( ! Object.prototype.hasOwnProperty.call( fields, action.oldKey ) ) {
				return fields;
			}

			if ( Object.prototype.hasOwnProperty.call( fields, action.newKey ) ) {
				return fields;
			}

			if ( ! isValidKey( action.newKey ) || isReservedKey( action.newKey ) ) {
				return fields;
			}

			const next = { ...fields };
			const field = next[ action.oldKey ];

			delete next[ action.oldKey ];

			next[ action.newKey ] = { ...field, key: action.newKey };

			return next;
		}

		default:
			return fields;
	}
}
