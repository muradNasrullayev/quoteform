const SIMPLE_INPUTS = {
	number: 'number',
	text: 'text',
	email: 'email',
	tel: 'tel',
	date: 'date',
	slider: 'range',
	hidden: 'hidden',
	toggle: 'checkbox',
};

const GROUP_TYPES = [ 'radio', 'checkbox' ];
const NUMERIC_ATTRS = [ 'min', 'max', 'step' ];

// Server (Submissions\InputSanitizer) bu limitdən uzun mətni rədd edir;
// brauzer də eyni limiti qoyur ki, adi ziyarətçi ona heç vaxt çatmasın.
const TEXT_LIMITS = { text: 500, email: 500, tel: 500, textarea: 5000 };

// Id-lər MOUNT-a görə adlandırılır, formanın id-sinə görə YOX. Eyni shortcode
// bir səhifədə iki dəfə işlədilə bilər, formanın id-si isə hər iki nüsxədə
// eynidir: o zaman `id`-lər təkrarlanır və hər `label[for]`, hər
// `aria-describedby` birinci nüsxəyə işarə edərdi. Daha pisi radio qrupudur —
// qruplaşma `name` ilə, sahib isə (renderer `<form>` emit etmədiyi üçün)
// sənədin özü ilə müəyyən olunur, yəni iki nüsxə BİR qrup olur və ikincidə
// seçim etmək birincinin seçimini söndürərdi.
let mounts = 0;

export function nextNamespace( formId ) {
	mounts += 1;

	return `quoteform_${ formId }_${ mounts }`;
}

function controlId( namespace, key ) {
	return `${ namespace }_${ key }`;
}

function applyNumericAttrs( input, field ) {
	NUMERIC_ATTRS.forEach( ( attr ) => {
		if ( field[ attr ] !== undefined && field[ attr ] !== null && field[ attr ] !== '' ) {
			input.setAttribute( attr, String( field[ attr ] ) );
		}
	} );
}

function describedBy( helpId, errorId ) {
	return errorId ? `${ helpId } ${ errorId }` : helpId;
}

function buildWrapper( field, namespace, input, labelHost ) {
	const id = controlId( namespace, field.key );
	const helpId = `${ id }_help`;
	const errorId = `${ id }_error`;

	const wrapper = document.createElement( 'div' );
	wrapper.className = 'quoteform_control';

	const label = document.createElement( 'label' );
	label.setAttribute( 'for', id );
	label.textContent = field.label;
	wrapper.appendChild( label );

	wrapper.appendChild( labelHost );

	const help = document.createElement( 'p' );
	help.className = 'quoteform_help';
	help.id = helpId;
	help.textContent = field.help || '';
	wrapper.appendChild( help );

	const error = document.createElement( 'p' );
	error.className = 'quoteform_error';
	error.id = errorId;
	wrapper.appendChild( error );

	input.setAttribute( 'aria-describedby', describedBy( helpId, null ) );

	if ( field.required ) {
		input.setAttribute( 'aria-required', 'true' );
	}

	const setError = ( message ) => {
		if ( message ) {
			error.textContent = message;
			input.setAttribute( 'aria-invalid', 'true' );
			input.setAttribute( 'aria-describedby', describedBy( helpId, errorId ) );
		} else {
			error.textContent = '';
			input.removeAttribute( 'aria-invalid' );
			input.setAttribute( 'aria-describedby', describedBy( helpId, null ) );
		}
	};

	return { wrapper, input, setError };
}

function buildHidden( field, namespace ) {
	const id = controlId( namespace, field.key );
	const input = document.createElement( 'input' );
	input.type = 'hidden';
	input.id = id;
	input.name = id;

	if ( field.default !== undefined && field.default !== null ) {
		input.value = field.default;
	}

	const wrapper = document.createElement( 'div' );
	wrapper.className = 'quoteform_control';
	wrapper.appendChild( input );

	return { wrapper, input, setError: () => {} };
}

function buildSimple( field, namespace ) {
	const id = controlId( namespace, field.key );

	if ( field.type === 'hidden' ) {
		return buildHidden( field, namespace );
	}

	const input = document.createElement( 'input' );
	input.type = SIMPLE_INPUTS[ field.type ];
	input.id = id;
	input.name = id;

	const limit = TEXT_LIMITS[ field.type ];

	if ( limit ) {
		input.maxLength = limit;
	}

	if ( field.placeholder ) {
		input.placeholder = field.placeholder;
	}

	applyNumericAttrs( input, field );

	return buildWrapper( field, namespace, input, input );
}

function buildTextarea( field, namespace ) {
	const id = controlId( namespace, field.key );
	const input = document.createElement( 'textarea' );
	input.id = id;
	input.name = id;
	input.maxLength = TEXT_LIMITS.textarea;

	if ( field.placeholder ) {
		input.placeholder = field.placeholder;
	}

	return buildWrapper( field, namespace, input, input );
}

function buildSelect( field, namespace ) {
	const id = controlId( namespace, field.key );
	const input = document.createElement( 'select' );
	input.id = id;
	input.name = id;

	const placeholder = document.createElement( 'option' );
	placeholder.value = '';
	placeholder.textContent = field.placeholder ? field.placeholder : '—';
	input.appendChild( placeholder );

	const options = Array.isArray( field.options ) ? field.options : [];
	options.forEach( ( option ) => {
		const optionEl = document.createElement( 'option' );
		optionEl.value = option.value;
		optionEl.textContent = option.label;
		input.appendChild( optionEl );
	} );

	return buildWrapper( field, namespace, input, input );
}

function buildGroup( field, namespace ) {
	const id = controlId( namespace, field.key );
	const helpId = `${ id }_help`;
	const errorId = `${ id }_error`;
	const inputType = field.type === 'radio' ? 'radio' : 'checkbox';

	const wrapper = document.createElement( 'div' );
	wrapper.className = 'quoteform_control';

	const fieldset = document.createElement( 'fieldset' );

	const legend = document.createElement( 'legend' );
	legend.textContent = field.label;
	fieldset.appendChild( legend );

	const options = Array.isArray( field.options ) ? field.options : [];
	const inputs = [];

	options.forEach( ( option, index ) => {
		const optionId = `${ id }_${ index }`;

		const optionWrapper = document.createElement( 'div' );
		optionWrapper.className = 'quoteform_option';

		const optionInput = document.createElement( 'input' );
		optionInput.type = inputType;
		optionInput.id = optionId;
		optionInput.name = id;
		optionInput.value = option.value;
		optionInput.setAttribute( 'aria-describedby', describedBy( helpId, null ) );

		if ( field.required ) {
			optionInput.setAttribute( 'aria-required', 'true' );
		}

		const optionLabel = document.createElement( 'label' );
		optionLabel.setAttribute( 'for', optionId );
		optionLabel.textContent = option.label;

		optionWrapper.appendChild( optionInput );
		optionWrapper.appendChild( optionLabel );
		fieldset.appendChild( optionWrapper );

		inputs.push( optionInput );
	} );

	wrapper.appendChild( fieldset );

	const help = document.createElement( 'p' );
	help.className = 'quoteform_help';
	help.id = helpId;
	help.textContent = field.help || '';
	wrapper.appendChild( help );

	const error = document.createElement( 'p' );
	error.className = 'quoteform_error';
	error.id = errorId;
	wrapper.appendChild( error );

	const setError = ( message ) => {
		inputs.forEach( ( optionInput ) => {
			if ( message ) {
				optionInput.setAttribute( 'aria-invalid', 'true' );
				optionInput.setAttribute( 'aria-describedby', describedBy( helpId, errorId ) );
			} else {
				optionInput.removeAttribute( 'aria-invalid' );
				optionInput.setAttribute( 'aria-describedby', describedBy( helpId, null ) );
			}
		} );

		error.textContent = message || '';
	};

	return { wrapper, input: inputs[ 0 ], setError };
}

function buildHtmlBlock( field, namespace ) {
	const wrapper = document.createElement( 'div' );
	wrapper.className = 'quoteform_control';

	const content = document.createElement( 'div' );

	// `content` `wp_kses_post` ile save vaxti sanitize olunub, ona gore
	// burda `innerHTML` istifadesi tehlukesizdir; `textContent` isteyicilere
	// oz yazdiqlari HTML-i literal metn kimi gostererdi.
	content.innerHTML = field.content || '';
	wrapper.appendChild( content );

	return { wrapper, input: null, setError: () => {} };
}

export function buildControl( field, namespace ) {
	if ( field.type === 'html' ) {
		return buildHtmlBlock( field, namespace );
	}

	if ( GROUP_TYPES.indexOf( field.type ) !== -1 ) {
		return buildGroup( field, namespace );
	}

	if ( field.type === 'select' ) {
		return buildSelect( field, namespace );
	}

	if ( Object.prototype.hasOwnProperty.call( SIMPLE_INPUTS, field.type ) ) {
		return buildSimple( field, namespace );
	}

	if ( field.type === 'textarea' ) {
		return buildTextarea( field, namespace );
	}

	return null;
}
