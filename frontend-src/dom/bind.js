const GROUP_TYPES = [ 'radio', 'checkbox' ];

function checkedInputs( control ) {
	return [ ...control.wrapper.querySelectorAll( 'input:checked' ) ];
}

export function readValue( control, field ) {
	if ( field.type === 'checkbox' ) {
		return checkedInputs( control ).map( ( input ) => input.value );
	}

	if ( field.type === 'radio' ) {
		const checked = checkedInputs( control )[ 0 ];

		return checked ? checked.value : '';
	}

	if ( ! control.input ) {
		return '';
	}

	return field.type === 'toggle' ? control.input.checked : control.input.value;
}

export function applyValue( control, field, value ) {
	if ( GROUP_TYPES.indexOf( field.type ) !== -1 ) {
		const selected = Array.isArray( value ) ? value.map( String ) : [ String( value ) ];

		control.wrapper.querySelectorAll( 'input' ).forEach( ( input ) => {
			input.checked = selected.indexOf( input.value ) !== -1;
		} );

		return;
	}

	if ( ! control.input ) {
		return;
	}

	if ( field.type === 'toggle' ) {
		control.input.checked = value === true || value === 1 || value === '1';

		return;
	}

	control.input.value = value === undefined || value === null ? '' : String( value );
}

export function bindControl( control, field, onValue ) {
	if ( field.type === 'html' ) {
		return () => {};
	}

	const handler = () => onValue( readValue( control, field ) );

	control.wrapper.addEventListener( 'input', handler );
	control.wrapper.addEventListener( 'change', handler );

	return () => {
		control.wrapper.removeEventListener( 'input', handler );
		control.wrapper.removeEventListener( 'change', handler );
	};
}
