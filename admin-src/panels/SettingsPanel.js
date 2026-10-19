import { __ } from '@wordpress/i18n';

import Card from '../components/Card';
import NumberControl from '../components/NumberControl';
import SelectControl from '../components/SelectControl';
import TextControl from '../components/TextControl';
import ToggleControl from '../components/ToggleControl';
import { setSetting } from '../state/actions';
import { errorsFor } from '../state/errors';
import { useDispatch, useStore } from '../state/StoreContext';

export default function SettingsPanel( { errorIndex } ) {
	const { schema } = useStore();
	const dispatch = useDispatch();

	if ( schema === null ) {
		return null;
	}

	const settings = schema.settings;
	const change = ( key ) => ( value ) => dispatch( setSetting( key, value ) );
	const errors = ( key ) => errorsFor( errorIndex, `settings.${ key }` );

	return (
		<section className="quoteform_panel" aria-labelledby="quoteform_settings-heading">
			<div className="quoteform_panel__head">
				<h2 id="quoteform_settings-heading">{ __( 'Settings', 'quoteform' ) }</h2>
			</div>

			<Card className="quoteform_settings-group">
				<h3>{ __( 'Money', 'quoteform' ) }</h3>
				<div className="quoteform_settings-group__row">
					<TextControl
						id="quoteform_currency"
						label={ __( 'Currency', 'quoteform' ) }
						value={ settings.currency }
						onChange={ change( 'currency' ) }
						errors={ errors( 'currency' ) }
						help={ __( 'A three-letter code such as USD or EUR.', 'quoteform' ) }
					/>

					<SelectControl
						id="quoteform_currency-position"
						label={ __( 'Currency position', 'quoteform' ) }
						value={ settings.currency_position }
						onChange={ change( 'currency_position' ) }
						errors={ errors( 'currency_position' ) }
						options={ [
							{ value: 'before', label: __( 'Before the number', 'quoteform' ) },
							{ value: 'after', label: __( 'After the number', 'quoteform' ) },
						] }
					/>

					<NumberControl
						id="quoteform_decimals"
						label={ __( 'Decimal places', 'quoteform' ) }
						value={ settings.decimals }
						onChange={ change( 'decimals' ) }
						errors={ errors( 'decimals' ) }
						min={ 0 }
						max={ 6 }
						step={ 1 }
					/>
				</div>
			</Card>

			<Card className="quoteform_settings-group">
				<h3>{ __( 'After submitting', 'quoteform' ) }</h3>

				<TextControl
					id="quoteform_submit-label"
					label={ __( 'Submit button label', 'quoteform' ) }
					value={ settings.submit_label }
					onChange={ change( 'submit_label' ) }
					errors={ errors( 'submit_label' ) }
				/>

				<SelectControl
					id="quoteform_success-action"
					label={ __( 'After a successful submission', 'quoteform' ) }
					value={ settings.success_action }
					onChange={ change( 'success_action' ) }
					errors={ errors( 'success_action' ) }
					options={ [
						{ value: 'message', label: __( 'Show a message', 'quoteform' ) },
						{ value: 'redirect', label: __( 'Redirect to a URL', 'quoteform' ) },
					] }
				/>

				{ settings.success_action === 'redirect' ? (
					<TextControl
						id="quoteform_redirect-url"
						label={ __( 'Redirect URL', 'quoteform' ) }
						value={ settings.redirect_url }
						onChange={ change( 'redirect_url' ) }
						errors={ errors( 'redirect_url' ) }
						help={ __( 'Must start with http:// or https://.', 'quoteform' ) }
					/>
				) : (
					<TextControl
						id="quoteform_success-message"
						label={ __( 'Success message', 'quoteform' ) }
						value={ settings.success_message }
						onChange={ change( 'success_message' ) }
						errors={ errors( 'success_message' ) }
						multiline
					/>
				) }
			</Card>

			<Card className="quoteform_settings-group">
				<h3>{ __( 'Visitors', 'quoteform' ) }</h3>

				<ToggleControl
					id="quoteform_save-resume"
					label={ __( 'Let visitors save and resume', 'quoteform' ) }
					checked={ settings.save_resume }
					onChange={ change( 'save_resume' ) }
					errors={ errors( 'save_resume' ) }
				/>

				<ToggleControl
					id="quoteform_store-ip"
					label={ __( 'Store the visitor’s IP address with each entry', 'quoteform' ) }
					checked={ settings.store_ip }
					onChange={ change( 'store_ip' ) }
					errors={ errors( 'store_ip' ) }
				/>
			</Card>
		</section>
	);
}
