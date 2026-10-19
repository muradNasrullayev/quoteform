import ControlLabel from './ControlLabel';
import FieldError from './FieldError';

export default function ToggleControl( { id, label, checked, onChange, errors, help = '', visibleLabel, hideLabel = false } ) {
	const safeErrors = errors ?? [];
	const hasErrors = safeErrors.length > 0;
	const errorId = `${ id }-error`;
	const helpId = `${ id }-help`;
	const describedBy =
		[ hasErrors ? errorId : null, help ? helpId : null ].filter( Boolean ).join( ' ' ) ||
		undefined;

	return (
		<div className="quoteform_control quoteform_control--toggle">
			<input
				id={ id }
				type="checkbox"
				checked={ checked }
				aria-invalid={ hasErrors ? 'true' : undefined }
				aria-describedby={ describedBy }
				onChange={ ( event ) => onChange( event.target.checked ) }
			/>
			<ControlLabel htmlFor={ id } label={ label } visibleLabel={ visibleLabel } hideLabel={ hideLabel } />
			{ help && (
				<p className="quoteform_help" id={ helpId }>
					{ help }
				</p>
			) }
			<FieldError id={ errorId } errors={ safeErrors } />
		</div>
	);
}
