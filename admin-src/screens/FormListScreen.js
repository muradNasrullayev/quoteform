import { useCallback, useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { createForm, deleteForm, listForms } from '../api/client';
import Button from '../components/Button';
import Card from '../components/Card';
import CopyField from '../components/CopyField';
import Notice from '../components/Notice';
import { formatModified, toUtcIso } from '../lib/dates';
import { errorMessage } from '../lib/apiErrors';
import { shortcodeFor } from '../lib/shortcode';

export default function FormListScreen( { onOpen, focusOnMount = false } ) {
	const [ forms, setForms ] = useState( [] );
	const [ loading, setLoading ] = useState( true );
	const [ error, setError ] = useState( null );
	const [ canRetryLoad, setCanRetryLoad ] = useState( false );
	const [ busy, setBusy ] = useState( false );
	const [ confirming, setConfirming ] = useState( null );
	const [ page, setPage ] = useState( 1 );
	const [ totalPages, setTotalPages ] = useState( 1 );

	const headingRef = useRef( null );
	const createButtonRef = useRef( null );
	const confirmButtonRef = useRef( null );
	const trashButtonRefs = useRef( {} );
	const pendingFocusRef = useRef( null );

	const load = useCallback( async () => {
		setLoading( true );
		setError( null );
		setCanRetryLoad( false );

		try {
			const result = await listForms( { page } );

			setForms( result.forms );
			setTotalPages(
				Number.isFinite( result.totalPages ) ? Math.max( result.totalPages, 1 ) : 1
			);
		} catch ( caught ) {
			setError( caught );
			setCanRetryLoad( true );
		} finally {
			setLoading( false );
		}
	}, [ page ] );

	useEffect( () => {
		load();
	}, [ load ] );

	useEffect( () => {
		if ( focusOnMount ) {
			headingRef.current?.focus();
		}
	}, [ focusOnMount ] );

	useEffect( () => {
		if ( confirming ) {
			confirmButtonRef.current?.focus();
		}
	}, [ confirming ] );

	// The create/trash buttons are disabled ( disabled={ busy } ) for the
	// whole lifetime of a delete request, and a disabled element cannot take
	// focus. So the actual `.focus()` call has to wait until `busy` flips
	// back to false and the target button is focusable again.
	useEffect( () => {
		if ( ! busy && pendingFocusRef.current ) {
			pendingFocusRef.current();
			pendingFocusRef.current = null;
		}
	}, [ busy ] );

	async function handleCreate() {
		setBusy( true );
		setError( null );
		setCanRetryLoad( false );

		try {
			const form = await createForm( __( 'Untitled form', 'quoteform' ) );

			onOpen( form.id );
		} catch ( caught ) {
			setError( caught );
		} finally {
			setBusy( false );
		}
	}

	function handleCancelDelete( form ) {
		setConfirming( null );
		trashButtonRefs.current[ form.id ]?.focus();
	}

	async function handleDelete( form ) {
		setConfirming( null );
		setBusy( true );
		setError( null );
		setCanRetryLoad( false );

		try {
			await deleteForm( form.id );

			setForms( ( current ) => current.filter( ( item ) => item.id !== form.id ) );
			pendingFocusRef.current = () => createButtonRef.current?.focus();
		} catch ( caught ) {
			setError( caught );
			pendingFocusRef.current = () => trashButtonRefs.current[ form.id ]?.focus();
		} finally {
			setBusy( false );
		}
	}

	return (
		<div className="quoteform_list">
			<div className="quoteform_list__header">
				<h1 ref={ headingRef } tabIndex={ -1 }>
					{ __( 'Quoteform', 'quoteform' ) }
				</h1>
				<Button variant="primary" ref={ createButtonRef } onClick={ handleCreate } disabled={ busy }>
					{ __( 'Create a form', 'quoteform' ) }
				</Button>
			</div>

			{ error && (
				<Notice status="error" onDismiss={ () => setError( null ) }>
					{ errorMessage( error ) }
				</Notice>
			) }

			{ error && canRetryLoad && (
				<Button onClick={ load }>{ __( 'Try again', 'quoteform' ) }</Button>
			) }

			{ loading && <p className="quoteform_card quoteform_empty">{ __( 'Loading forms…', 'quoteform' ) }</p> }

			{ ! loading && forms.length === 0 && ! error && (
				<Card className="quoteform_empty">
					<span className="dashicons dashicons-calculator" aria-hidden="true" />
					<p>{ __( 'No forms yet. Create your first one.', 'quoteform' ) }</p>
				</Card>
			) }

			{ forms.length > 0 && (
				<Card>
					<table className="quoteform_list__table">
						<thead>
							<tr>
								<th scope="col">{ __( 'Form', 'quoteform' ) }</th>
								<th scope="col">{ __( 'Shortcode', 'quoteform' ) }</th>
								<th scope="col">{ __( 'Last modified', 'quoteform' ) }</th>
								<th scope="col">{ __( 'Actions', 'quoteform' ) }</th>
							</tr>
						</thead>
						<tbody>
							{ forms.map( ( form ) => (
								<tr key={ form.id }>
									<td>
										<strong className="quoteform_list__title">{ form.title }</strong>
										<span className="quoteform_list__id">
											{ sprintf(
												/* translators: %d: form id. */
												__( 'ID %d', 'quoteform' ),
												form.id
											) }
										</span>
									</td>
									<td>
										<CopyField
											id={ `quoteform_shortcode-${ form.id }` }
											value={ shortcodeFor( form.id ) }
											label={ sprintf(
												/* translators: %s: form title. */
												__( 'Shortcode for “%s”', 'quoteform' ),
												form.title
											) }
											buttonLabel={ sprintf(
												/* translators: %s: form title. */
												__( 'Copy shortcode for “%s”', 'quoteform' ),
												form.title
											) }
										/>
									</td>
									<td>
										<time dateTime={ toUtcIso( form.modified ) }>
											{ formatModified( form.modified, document.documentElement.lang ) }
										</time>
									</td>
									<td className="quoteform_list__actions">
										<Button
											onClick={ () => onOpen( form.id ) }
											aria-label={ sprintf(
												/* translators: 1: form title, 2: form id. */
												__( 'Edit “%1$s” (form %2$d)', 'quoteform' ),
												form.title,
												form.id
											) }
										>
											{ __( 'Edit', 'quoteform' ) }
										</Button>
										<Button
											variant="danger"
											ref={ ( el ) => {
												trashButtonRefs.current[ form.id ] = el;
											} }
											onClick={ () => setConfirming( form ) }
											disabled={ busy }
											aria-label={ sprintf(
												/* translators: 1: form title, 2: form id. */
												__( 'Move “%1$s” to trash (form %2$d)', 'quoteform' ),
												form.title,
												form.id
											) }
										>
											{ __( 'Trash', 'quoteform' ) }
										</Button>
										{ confirming && confirming.id === form.id && (
											<span className="quoteform_confirm">
												<span>
													{ sprintf(
														/* translators: %s: form title. */
														__( 'Move “%s” to the trash?', 'quoteform' ),
														confirming.title
													) }
												</span>
												<Button
													variant="danger"
													ref={ confirmButtonRef }
													onClick={ () => handleDelete( confirming ) }
												>
													{ __( 'Move to trash', 'quoteform' ) }
												</Button>
												<Button onClick={ () => handleCancelDelete( confirming ) }>
													{ __( 'Cancel', 'quoteform' ) }
												</Button>
											</span>
										) }
									</td>
								</tr>
							) ) }
						</tbody>
					</table>
				</Card>
			) }

			{ totalPages > 1 && (
				<nav
					className="quoteform_list__pages"
					aria-label={ __( 'Form list pages', 'quoteform' ) }
				>
					{ Array.from( { length: totalPages }, ( _, index ) => index + 1 ).map(
						( number ) => (
							<button
								key={ number }
								type="button"
								onClick={ () => setPage( number ) }
								aria-current={ number === page ? 'page' : undefined }
								aria-label={ sprintf(
									/* translators: 1: page number. 2: how many pages there are. */
									__( 'Page %1$d of %2$d', 'quoteform' ),
									number,
									totalPages
								) }
							>
								{ number }
							</button>
						)
					) }
				</nav>
			) }
		</div>
	);
}
