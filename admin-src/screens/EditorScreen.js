import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { __, isRTL } from '@wordpress/i18n';

import { getForm, updateForm } from '../api/client';
import Button from '../components/Button';
import Card from '../components/Card';
import Notice from '../components/Notice';
import SectionNav from '../components/SectionNav';
import { errorMessage, needsReload } from '../lib/apiErrors';
import TextControl from '../components/TextControl';
import CalculationsPanel from '../panels/CalculationsPanel';
import FieldEditor from '../panels/FieldEditor';
import FieldsPanel from '../panels/FieldsPanel';
import RulesPanel from '../panels/RulesPanel';
import SettingsPanel from '../panels/SettingsPanel';
import StepsPanel from '../panels/StepsPanel';
import {
	dismissSaveError,
	loadFailed,
	loadStarted,
	loadSucceeded,
	saveFailed,
	saveStarted,
	saveSucceeded,
	setTitle,
} from '../state/actions';
import { EMPTY_INDEX, hasErrorsUnder, indexErrors } from '../state/errors';
import { useDispatch, useStore } from '../state/StoreContext';

const TABS = [ 'fields', 'steps', 'calculations', 'rules', 'settings' ];

const TAB_LABELS = {
	fields: __( 'Fields', 'quoteform' ),
	steps: __( 'Steps', 'quoteform' ),
	calculations: __( 'Pricing', 'quoteform' ),
	rules: __( 'Rules', 'quoteform' ),
	settings: __( 'Settings', 'quoteform' ),
};

function countFor( schema, name ) {
	if ( name === 'fields' ) {
		return Object.keys( schema.fields ).length;
	}

	if ( name === 'settings' ) {
		return null;
	}

	return schema[ name ].length;
}

export default function EditorScreen( { formId, onClose, focusOnMount = false } ) {
	const state = useStore();
	const dispatch = useDispatch();
	const [ tab, setTab ] = useState( TABS[ 0 ] );
	const [ selectedField, setSelectedField ] = useState( null );
	const [ saved, setSaved ] = useState( false );
	const [ leaving, setLeaving ] = useState( false );

	const headingRef = useRef( null );
	const backButtonRef = useRef( null );
	const stayButtonRef = useRef( null );
	const saveButtonRef = useRef( null );
	const pendingSaveFocusRef = useRef( false );
	const saveTokenRef = useRef( 0 );

	useEffect( () => {
		if ( focusOnMount ) {
			headingRef.current?.focus();
		}
	}, [ focusOnMount ] );

	// Yükləmə effektindəki `cancelled` bayrağının eynisi, yalnız YAZMA yolu
	// üçün: A formasının cavabı, istifadəçi artıq B-ni açandan sonra gəlsə,
	// ortaq store-a A-nın kimliyini yazardı.
	useEffect( () => {
		return () => {
			saveTokenRef.current += 1;
		};
	}, [ formId ] );

	useEffect( () => {
		let cancelled = false;

		dispatch( loadStarted() );

		getForm( formId )
			.then( ( form ) => {
				if ( ! cancelled ) {
					dispatch( loadSucceeded( form ) );
				}
			} )
			.catch( ( error ) => {
				if ( ! cancelled ) {
					dispatch( loadFailed( error ) );
				}
			} );

		return () => {
			cancelled = true;
		};
	}, [ formId, dispatch ] );

	useEffect( () => {
		if ( ! state.dirty ) {
			return undefined;
		}

		const warn = ( event ) => {
			event.preventDefault();
			event.returnValue = '';
		};

		window.addEventListener( 'beforeunload', warn );

		return () => window.removeEventListener( 'beforeunload', warn );
	}, [ state.dirty ] );

	useEffect( () => {
		if ( leaving ) {
			stayButtonRef.current?.focus();
		}
	}, [ leaving ] );

	useEffect( () => {
		if ( ! leaving ) {
			return undefined;
		}

		function onKeyDown( event ) {
			if ( event.key === 'Escape' ) {
				cancelLeaving();
			}
		}

		document.addEventListener( 'keydown', onKeyDown );

		return () => document.removeEventListener( 'keydown', onKeyDown );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ leaving ] );

	useEffect( () => {
		if ( ! state.saving && pendingSaveFocusRef.current ) {
			pendingSaveFocusRef.current = false;
			saveButtonRef.current?.focus();
		}
	}, [ state.saving ] );

	const errorIndex = useMemo(
		() => ( state.saveError ? indexErrors( state.saveError.errors ) : EMPTY_INDEX ),
		[ state.saveError ]
	);

	async function handleSave() {
		const token = saveTokenRef.current;

		setSaved( false );
		pendingSaveFocusRef.current = true;
		dispatch( saveStarted() );

		try {
			const form = await updateForm( formId, { title: state.title, schema: state.schema } );

			if ( token !== saveTokenRef.current ) {
				return;
			}

			dispatch( saveSucceeded( form ) );
			setSaved( true );
		} catch ( error ) {
			if ( token !== saveTokenRef.current ) {
				return;
			}

			dispatch( saveFailed( error ) );
		}
	}

	function handleBack() {
		if ( state.dirty ) {
			setLeaving( true );

			return;
		}

		onClose();
	}

	function cancelLeaving() {
		setLeaving( false );
		backButtonRef.current?.focus();
	}

	if ( state.loadError ) {
		const corrupt = state.loadError.code === 'qform_schema_corrupt';

		return (
			<div className="quoteform_editor">
				<h1 ref={ headingRef } tabIndex={ -1 }>
					{ __( 'Edit form', 'quoteform' ) }
				</h1>

				<Notice status="error">
					{ corrupt
						? __(
								'This form’s saved data could not be read. Editing it here would overwrite what is still stored, so Quoteform will not open it.',
								'quoteform'
						  )
						: errorMessage( state.loadError ) }
				</Notice>
				{ ! corrupt && needsReload( state.loadError ) && (
					<button type="button" onClick={ () => window.location.reload() }>
						{ __( 'Reload page', 'quoteform' ) }
					</button>
				) }
				<button type="button" onClick={ onClose }>
					{ __( 'Back to all forms', 'quoteform' ) }
				</button>
			</div>
		);
	}

	if ( state.schema === null || state.id !== formId ) {
		return (
			<div className="quoteform_editor">
				<h1 ref={ headingRef } tabIndex={ -1 }>
					{ __( 'Edit form', 'quoteform' ) }
				</h1>

				<p role="status">{ __( 'Loading…', 'quoteform' ) }</p>
				<button type="button" onClick={ onClose }>
					{ __( 'Back to all forms', 'quoteform' ) }
				</button>
			</div>
		);
	}

	const tabs = TABS.map( ( name ) => ( {
		name,
		label: TAB_LABELS[ name ],
		count: countFor( state.schema, name ),
		hasProblem: hasErrorsUnder( errorIndex, name ),
	} ) );

	return (
		<div className="quoteform_editor">
			<h1 ref={ headingRef } tabIndex={ -1 } className="screen-reader-text">
				{ __( 'Edit form', 'quoteform' ) }
			</h1>

			<div className="quoteform_topbar">
				<Button
					variant="ghost"
					ref={ backButtonRef }
					onClick={ handleBack }
					aria-label={ __( 'Back to all forms', 'quoteform' ) }
				>
					<span aria-hidden="true">{ isRTL() ? '→' : '←' }</span>
					{ __( 'Forms', 'quoteform' ) }
				</Button>

				<span className="quoteform_topbar__sep" aria-hidden="true">
					/
				</span>

				<div className="quoteform_topbar__title">
					<TextControl
						id="quoteform_form-title"
						label={ __( 'Form title', 'quoteform' ) }
						hideLabel
						value={ state.title }
						onChange={ ( value ) => dispatch( setTitle( value ) ) }
					/>
				</div>

				<div className="quoteform_topbar__actions">
					{ state.dirty && (
						<span className="quoteform_editor__dirty quoteform_badge quoteform_badge--dirty">
							{ __( 'Unsaved changes', 'quoteform' ) }
						</span>
					) }

					<Button
						variant="primary"
						ref={ saveButtonRef }
						onClick={ handleSave }
						disabled={ state.saving }
						aria-busy={ state.saving ? 'true' : undefined }
					>
						{ __( 'Save', 'quoteform' ) }
					</Button>
				</div>
			</div>

			{ leaving && (
				<div className="quoteform_confirm">
					<p>{ __( 'You have unsaved changes. Leave anyway?', 'quoteform' ) }</p>
					<Button
						variant="danger"
						onClick={ () => {
							setLeaving( false );
							onClose();
						} }
					>
						{ __( 'Leave without saving', 'quoteform' ) }
					</Button>
					<Button ref={ stayButtonRef } onClick={ cancelLeaving }>
						{ __( 'Stay here', 'quoteform' ) }
					</Button>
				</div>
			) }

			{ saved && ! state.dirty && (
				<Notice status="success" onDismiss={ () => setSaved( false ) }>
					{ __( 'Saved.', 'quoteform' ) }
				</Notice>
			) }

			{ state.saveError && (
				<Notice status="error" onDismiss={ () => dispatch( dismissSaveError() ) }>
					<p>{ errorMessage( state.saveError ) }</p>
					{ needsReload( state.saveError ) && (
						<Button onClick={ () => window.location.reload() }>
							{ __( 'Reload page', 'quoteform' ) }
						</Button>
					) }
					{ state.saveError.errors.length > 0 && (
						<ul>
							{ state.saveError.errors.map( ( error, index ) => (
								<li key={ `${ error.path }-${ index }` }>
									<code>{ error.path || __( 'the form', 'quoteform' ) }</code>{ ' ' }
									{ error.message }
								</li>
							) ) }
						</ul>
					) }
				</Notice>
			) }

			<div className="quoteform_editor__body">
				<SectionNav
					label={ __( 'Builder sections', 'quoteform' ) }
					tabs={ tabs }
					current={ tab }
					onSelect={ setTab }
				/>

				<div className="quoteform_editor__content">
					{ tab === 'fields' && (
						<div className="quoteform_fields-layout">
							<FieldsPanel
								errorIndex={ errorIndex }
								selectedKey={ selectedField }
								onSelect={ setSelectedField }
							/>
							<div className="quoteform_fields-layout__editor">
								{ selectedField ? (
									<FieldEditor
										fieldKey={ selectedField }
										errorIndex={ errorIndex }
										onKeyChange={ setSelectedField }
									/>
								) : (
									<Card className="quoteform_empty">
										{ __( 'Select a field to edit it.', 'quoteform' ) }
									</Card>
								) }
							</div>
						</div>
					) }
					{ tab === 'steps' && <StepsPanel errorIndex={ errorIndex } /> }
					{ tab === 'calculations' && <CalculationsPanel errorIndex={ errorIndex } /> }
					{ tab === 'rules' && <RulesPanel errorIndex={ errorIndex } /> }
					{ tab === 'settings' && <SettingsPanel errorIndex={ errorIndex } /> }
				</div>
			</div>
		</div>
	);
}
