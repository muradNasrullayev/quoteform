import ControlLabel from './ControlLabel';
import FieldError from './FieldError';

export default function NumberControl( {
	id,
	label,
	value,
	onChange,
	errors,
	help = '',
	min,
	max,
	step,
	visibleLabel,
	hideLabel = false,
} ) {
	const safeErrors = errors ?? [];
	const hasErrors = safeErrors.length > 0;
	const errorId = `${ id }-error`;
	const helpId = `${ id }-help`;
	const describedBy =
		[ hasErrors ? errorId : null, help ? helpId : null ].filter( Boolean ).join( ' ' ) ||
		undefined;

	return (
		<div className="quoteform_control">
			<ControlLabel htmlFor={ id } label={ label } visibleLabel={ visibleLabel } hideLabel={ hideLabel } />
			<input
				id={ id }
				type="number"
				value={ value === null || value === undefined ? '' : value }
				min={ min }
				max={ max }
				step={ step }
				aria-invalid={ hasErrors ? 'true' : undefined }
				aria-describedby={ describedBy }
				onChange={ ( event ) => {
					const raw = event.target.value;

					if ( raw === '' ) {
						onChange( null );
						return;
					}

					onChange( Number( raw ) );
				} }
			/>
			{ help && (
				<p className="quoteform_help" id={ helpId }>
					{ help }
				</p>
			) }
			<FieldError id={ errorId } errors={ safeErrors } />
		</div>
	);
}
