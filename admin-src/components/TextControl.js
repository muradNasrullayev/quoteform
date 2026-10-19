import ControlLabel from './ControlLabel';
import FieldError from './FieldError';

export default function TextControl( {
	id,
	label,
	value,
	onChange,
	errors,
	help = '',
	multiline = false,
	disabled = false,
	describedBy,
	onBlur,
	onFocus,
	onKeyDown,
	visibleLabel,
	hideLabel = false,
} ) {
	const safeErrors = errors ?? [];
	const hasErrors = safeErrors.length > 0;
	const errorId = `${ id }-error`;
	const helpId = `${ id }-help`;
	const combinedDescribedBy =
		[ hasErrors ? errorId : null, help ? helpId : null, describedBy ]
			.filter( Boolean )
			.join( ' ' ) || undefined;
	const Tag = multiline ? 'textarea' : 'input';

	return (
		<div className="quoteform_control">
			<ControlLabel htmlFor={ id } label={ label } visibleLabel={ visibleLabel } hideLabel={ hideLabel } />
			<Tag
				id={ id }
				type={ multiline ? undefined : 'text' }
				value={ value }
				disabled={ disabled }
				aria-invalid={ hasErrors ? 'true' : undefined }
				aria-describedby={ combinedDescribedBy }
				onChange={ ( event ) => onChange( event.target.value ) }
				onBlur={ onBlur }
				onFocus={ onFocus }
				onKeyDown={ onKeyDown }
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
