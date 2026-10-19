import { __, sprintf } from '@wordpress/i18n';

import ControlLabel from './ControlLabel';
import FieldError from './FieldError';

export default function SelectControl( {
	id,
	label,
	value,
	onChange,
	options = [],
	errors,
	help = '',
	placeholder = '',
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
			<select
				id={ id }
				value={ value }
				aria-invalid={ hasErrors ? 'true' : undefined }
				aria-describedby={ describedBy }
				onChange={ ( event ) => onChange( event.target.value ) }
			>
				{ ! options.some( ( option ) => option.value === value ) &&
					( value === '' && placeholder ? (
						<option value="" disabled>
							{ placeholder }
						</option>
					) : (
						<option value={ value } disabled>
							{ sprintf(
								/* translators: %s: the stored value, which is not one of the options. */
								__( 'Unrecognised value: %s', 'quoteform' ),
								String( value )
							) }
						</option>
					) ) }
				{ options.map( ( option ) => (
					<option key={ option.value } value={ option.value }>
						{ option.label }
					</option>
				) ) }
			</select>
			{ help && (
				<p className="quoteform_help" id={ helpId }>
					{ help }
				</p>
			) }
			<FieldError id={ errorId } errors={ safeErrors } />
		</div>
	);
}
