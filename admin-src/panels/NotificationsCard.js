import { __ } from '@wordpress/i18n';

import Card from '../components/Card';
import FieldError from '../components/FieldError';
import TextControl from '../components/TextControl';
import ToggleControl from '../components/ToggleControl';
import { setNotification } from '../state/actions';
import { errorsFor } from '../state/errors';
import { useDispatch, useStore } from '../state/StoreContext';

export default function NotificationsCard( { errorIndex } ) {
	const { schema } = useStore();
	const dispatch = useDispatch();

	if ( schema === null ) {
		return null;
	}

	const notification = schema.notifications?.[ 0 ];
	const enabled = notification?.enabled === true;
	const toErrors = errorsFor( errorIndex, 'notifications.0.to' );
	const subjectErrors = errorsFor( errorIndex, 'notifications.0.subject' );
	// The server validates both fields even when the toggle is off, so an error
	// on them must stay visible or the user cannot fix it.
	const showFields = enabled || toErrors.length > 0 || subjectErrors.length > 0;
	const change = ( key ) => ( value ) => dispatch( setNotification( key, value ) );

	return (
		<Card className="quoteform_settings-group">
			<h3>{ __( 'Notifications', 'quoteform' ) }</h3>
			<FieldError id="quoteform_notify-error" errors={ errorsFor( errorIndex, 'notifications' ) } />

			<ToggleControl
				id="quoteform_notify-enabled"
				label={ __( 'Email me when someone submits this form', 'quoteform' ) }
				checked={ enabled }
				onChange={ change( 'enabled' ) }
				errors={ errorsFor( errorIndex, 'notifications.0.enabled' ) }
			/>

			{ showFields && (
				<>
					<TextControl
						id="quoteform_notify-to"
						label={ __( 'Send to', 'quoteform' ) }
						value={ notification?.to ?? '' }
						onChange={ change( 'to' ) }
						errors={ toErrors }
						help={ __(
							'Separate addresses with commas. Leave empty to use the site’s admin email address.',
							'quoteform'
						) }
					/>

					<TextControl
						id="quoteform_notify-subject"
						label={ __( 'Subject', 'quoteform' ) }
						value={ notification?.subject ?? '' }
						onChange={ change( 'subject' ) }
						errors={ subjectErrors }
						help={ __( 'You can use {form_name}, {total} and {entry_id}.', 'quoteform' ) }
					/>
				</>
			) }
		</Card>
	);
}
