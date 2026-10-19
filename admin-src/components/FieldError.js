export default function FieldError( { id, errors } ) {
	if ( errors.length === 0 ) {
		return null;
	}

	return (
		<ul className="quoteform_field-error" id={ id }>
			{ errors.map( ( error, index ) => (
				<li key={ `${ error.code }-${ index }` }>{ error.message }</li>
			) ) }
		</ul>
	);
}
