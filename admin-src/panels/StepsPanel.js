import { useEffect, useRef, useState } from '@wordpress/element';
import { __, _n, _x, sprintf } from '@wordpress/i18n';

import Button from '../components/Button';
import MoveButtons from '../components/MoveButtons';
import TextControl from '../components/TextControl';
import { displayName } from '../lib/names';
import {
	addStep,
	assignField,
	moveStep,
	removeStep,
	unassignField,
	updateStep,
} from '../state/actions';
import { errorsFor } from '../state/errors';
import { useDispatch, useStore } from '../state/StoreContext';

function removeConfirmMessage( step ) {
	const name = step.title || step.key;
	const count = step.fields.length;

	if ( count === 0 ) {
		return sprintf(
			/* translators: %s: step title or key. */
			__( 'Remove “%s”?', 'quoteform' ),
			name
		);
	}

	return sprintf(
		/* translators: 1: step title or key. 2: number of fields the step still holds, which will be unassigned. */
		_n(
			'Remove “%1$s” and unassign its %2$d field?',
			'Remove “%1$s” and unassign its %2$d fields?',
			count,
			'quoteform'
		),
		name,
		count
	);
}

/**
 * Bu iki ad düymələrin ÜSTÜNDƏ YAZILAN mətnlə başlayır (WCAG 2.5.3 — Label in
 * Name). Səslə idarə edən istifadəçi gördüyü sözləri deyir: əlçatan ad həmin
 * sözləri BÜTÖV parça kimi ehtiva etmirsə, əmr düyməyə düşmür. "Take %s off
 * this step" və "Put %s on the chosen step" məhz bu səbəbdən uyğun deyildi —
 * sahənin adı görünən sözlərin ORTASINA düşürdü.
 */
function takeOffLabel( name ) {
	return sprintf(
		/* translators: %s: field name, which already carries its key. */
		__( 'Take off this step: %s', 'quoteform' ),
		name
	);
}

function putOnStepLabel( name ) {
	return sprintf(
		/* translators: %s: field name, which already carries its key. */
		__( 'Put on step: %s', 'quoteform' ),
		name
	);
}

export default function StepsPanel( { errorIndex } ) {
	const { schema } = useStore();
	const dispatch = useDispatch();
	const [ confirming, setConfirming ] = useState( null );
	const [ choices, setChoices ] = useState( {} );

	const headingRef = useRef( null );
	const addButtonRef = useRef( null );
	const confirmButtonRef = useRef( null );
	const removeButtonRefs = useRef( {} );
	const takeOffButtonRefs = useRef( {} );
	const placeSelectRefs = useRef( {} );
	const pendingFocusRef = useRef( null );

	useEffect( () => {
		if ( confirming !== null ) {
			confirmButtonRef.current?.focus();
		}
	}, [ confirming ] );

	// Sahəni siyahılar arasında köçürmək onun operatorun indicə işlətdiyi
	// idarəsini söküb atır, ona görə hədəf yalnız növbəti render-dən sonra
	// mövcud olur — fokus buradan, ref-lər bağlandıqdan sonra verilir.
	useEffect( () => {
		const pending = pendingFocusRef.current;

		if ( pending === null ) {
			return;
		}

		pendingFocusRef.current = null;
		pending();
	} );

	if ( schema === null ) {
		return null;
	}

	const { steps, fields } = schema;
	const placed = new Set( steps.flatMap( ( step ) => step.fields ) );
	const unplaced = Object.keys( fields ).filter( ( key ) => ! placed.has( key ) );
	const nameOf = ( key ) => ( fields[ key ] ? displayName( fields[ key ].label, key ) : key );

	function handleAssign( key, stepIndex ) {
		pendingFocusRef.current = () =>
			( takeOffButtonRefs.current[ key ] || headingRef.current )?.focus();

		setChoices( ( current ) => {
			const next = { ...current };

			delete next[ key ];

			return next;
		} );

		dispatch( assignField( key, stepIndex ) );
	}

	function handleUnassign( key ) {
		pendingFocusRef.current = () =>
			( placeSelectRefs.current[ key ] || headingRef.current )?.focus();

		dispatch( unassignField( key ) );
	}

	function handleCancelRemove( key ) {
		setConfirming( null );
		removeButtonRefs.current[ key ]?.focus();
	}

	function handleRemove( index ) {
		setConfirming( null );
		dispatch( removeStep( index ) );
		addButtonRef.current?.focus();
	}

	return (
		<section className="quoteform_panel" aria-labelledby="quoteform_steps-heading">
			<div className="quoteform_panel__head">
				<div>
					<h2 id="quoteform_steps-heading" ref={ headingRef } tabIndex={ -1 }>
						{ __( 'Steps', 'quoteform' ) }
					</h2>
					<p className="quoteform_panel__intro">
						{ __( 'Visitors move through these one at a time.', 'quoteform' ) }
					</p>
				</div>
				<Button ref={ addButtonRef } onClick={ () => dispatch( addStep() ) }>
					{ __( 'Add step', 'quoteform' ) }
				</Button>
			</div>

			{ steps.length === 0 && (
				<p className="quoteform_card quoteform_empty">
					{ __( 'No steps yet. Add one to hold your fields.', 'quoteform' ) }
				</p>
			) }

			{ steps.map( ( step, index ) => {
				const number = index + 1;
				const at = ( key ) => errorsFor( errorIndex, `steps.${ index }.${ key }` );
				const stepName = sprintf(
					/* translators: 1: step number. 2: step title. */
					__( 'step %1$d: %2$s', 'quoteform' ),
					number,
					step.title || step.key
				);

				return (
					<div className="quoteform_step quoteform_card" key={ step.key || index }>
						<div className="quoteform_step__head" aria-hidden="true">
							<span className="quoteform_step__number">{ number }</span>
							<span className="quoteform_step__name">{ step.title || step.key }</span>
						</div>

						<div className="quoteform_step__texts">
							<TextControl
								id={ `quoteform_step-${ index }-title` }
								label={ sprintf(
									/* translators: %d: step number. */
									__( 'Step %d title', 'quoteform' ),
									number
								) }
								visibleLabel={
									/* translators: short visible label of a numbered step field; the full name is "Step N title". */
									_x( 'Title', 'short label for a numbered field', 'quoteform' )
								}
								value={ step.title }
								onChange={ ( value ) => dispatch( updateStep( index, { title: value } ) ) }
								errors={ at( 'title' ) }
							/>

							<TextControl
								id={ `quoteform_step-${ index }-description` }
								label={ sprintf(
									/* translators: %d: step number. */
									__( 'Step %d description', 'quoteform' ),
									number
								) }
								visibleLabel={
									/* translators: short visible label of a numbered step field; the full name is "Step N description". */
									_x( 'Description', 'short label for a numbered field', 'quoteform' )
								}
								value={ step.description }
								onChange={ ( value ) => dispatch( updateStep( index, { description: value } ) ) }
								errors={ at( 'description' ) }
								multiline
							/>
						</div>

						<div className="quoteform_step__tools">
							<MoveButtons
								label={ stepName }
								onMoveUp={ () => dispatch( moveStep( index, 'up' ) ) }
								onMoveDown={ () => dispatch( moveStep( index, 'down' ) ) }
								canMoveUp={ index > 0 }
								canMoveDown={ index < steps.length - 1 }
							/>

							<Button
								variant="danger"
								ref={ ( el ) => {
									removeButtonRefs.current[ step.key ] = el;
								} }
								onClick={ () => setConfirming( step.key ) }
								aria-label={ sprintf(
									/* translators: 1: step number. 2: step title. */
									__( 'Remove step %1$d: %2$s', 'quoteform' ),
									number,
									step.title || step.key
								) }
							>
								{ __( 'Remove step', 'quoteform' ) }
							</Button>
						</div>

						{ confirming === step.key && (
							<span className="quoteform_confirm">
								<span>{ removeConfirmMessage( step ) }</span>
								<Button variant="danger" ref={ confirmButtonRef } onClick={ () => handleRemove( index ) }>
									{ __( 'Remove step', 'quoteform' ) }
								</Button>
								<Button onClick={ () => handleCancelRemove( step.key ) }>
									{ __( 'Cancel', 'quoteform' ) }
								</Button>
							</span>
						) }

						<ul className="quoteform_step__fields">
							{ step.fields.map( ( key ) => (
								<li key={ key } className="quoteform_chip">
									<span>{ nameOf( key ) }</span>
									<button
										type="button"
										className="quoteform_chip__remove"
										ref={ ( el ) => {
											takeOffButtonRefs.current[ key ] = el;
										} }
										onClick={ () => handleUnassign( key ) }
										aria-label={ takeOffLabel( nameOf( key ) ) }
									>
										<span aria-hidden="true">✕</span>
									</button>
								</li>
							) ) }
						</ul>

						{ step.fields.length === 0 && (
							<p className="quoteform_warning">
								{ __( 'This step has no fields, so it cannot be saved.', 'quoteform' ) }
							</p>
						) }
					</div>
				);
			} ) }

			{ unplaced.length > 0 && (
				<div className="quoteform_unplaced">
					<h3>{ __( 'Not on any step — nobody can fill these in', 'quoteform' ) }</h3>
					<ul>
						{ unplaced.map( ( key ) => (
							<li key={ key }>
								<span>{ nameOf( key ) }</span>
								<label htmlFor={ `quoteform_place-${ key }` }>
									{ sprintf(
										/* translators: %s: field label. */
										__( 'Put %s on', 'quoteform' ),
										nameOf( key )
									) }
								</label>
								<select
									id={ `quoteform_place-${ key }` }
									ref={ ( el ) => {
										placeSelectRefs.current[ key ] = el;
									} }
									value={ choices[ key ] || '' }
									onChange={ ( event ) =>
										setChoices( ( current ) => ( {
											...current,
											[ key ]: event.target.value,
										} ) )
									}
								>
									<option value="" disabled>
										{ __( 'Choose a step…', 'quoteform' ) }
									</option>
									{ steps.map( ( step, index ) => (
										<option key={ step.key || index } value={ index }>
											{ displayName( step.title, step.key ) }
										</option>
									) ) }
								</select>
								<Button
									variant="primary"
									disabled={ ! choices[ key ] }
									onClick={ () => handleAssign( key, Number( choices[ key ] ) ) }
									aria-label={ putOnStepLabel( nameOf( key ) ) }
								>
									{ __( 'Put on step', 'quoteform' ) }
								</Button>
							</li>
						) ) }
					</ul>
				</div>
			) }
		</section>
	);
}
