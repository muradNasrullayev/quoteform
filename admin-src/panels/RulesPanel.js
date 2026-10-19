import { useRef, useState } from '@wordpress/element';
import { __, _x, isRTL, sprintf } from '@wordpress/i18n';

import Button from '../components/Button';
import FieldError from '../components/FieldError';
import RemoveConfirm from '../components/RemoveConfirm';
import SelectControl from '../components/SelectControl';
import { displayName } from '../lib/names';
import {
	addCondition,
	addRule,
	removeCondition,
	removeRule,
	updateCondition,
	updateRule,
} from '../state/actions';
import { errorsFor } from '../state/errors';
import { ACTION_LABELS, ACTIONS, FIELD_ONLY_ACTIONS } from '../state/rules';
import { useDispatch, useStore } from '../state/StoreContext';
import RuleConditionRow from './RuleConditionRow';

const TARGET_KINDS = [
	{ value: 'field', label: __( 'Field', 'quoteform' ) },
	{ value: 'step', label: __( 'Step', 'quoteform' ) },
];

const MATCH_MODES = [
	{ value: 'all', label: __( 'All conditions must match', 'quoteform' ) },
	{ value: 'any', label: __( 'Any condition may match', 'quoteform' ) },
];

function toOptions( keys, labelFor ) {
	return keys.map( ( key ) => ( { value: key, label: labelFor( key ) } ) );
}

export default function RulesPanel( { errorIndex } ) {
	const { schema } = useStore();
	const dispatch = useDispatch();

	const [ confirming, setConfirming ] = useState( null );

	const addRuleButtonRef = useRef( null );
	const removeButtonRefs = useRef( {} );
	const addConditionButtonRefs = useRef( {} );

	if ( schema === null ) {
		return null;
	}

	const { rules, fields, steps } = schema;
	const fieldKeys = Object.keys( fields );
	const fieldOptions = toOptions( fieldKeys, ( key ) => displayName( fields[ key ].label, key ) );
	const stepOptions = steps.map( ( step ) => ( {
		value: step.key,
		label: displayName( step.title, step.key ),
	} ) );

	function isConfirmingRule( index ) {
		return confirming?.type === 'rule' && confirming.index === index;
	}

	function isConfirmingCondition( ruleIndex, conditionIndex ) {
		return (
			confirming?.type === 'condition' &&
			confirming.ruleIndex === ruleIndex &&
			confirming.conditionIndex === conditionIndex
		);
	}

	function handleCancelRemoveRule( index ) {
		setConfirming( null );
		removeButtonRefs.current[ `rule-${ index }` ]?.focus();
	}

	function handleRemoveRule( index ) {
		setConfirming( null );
		dispatch( removeRule( index ) );
		addRuleButtonRef.current?.focus();
	}

	function handleCancelRemoveCondition( ruleIndex, conditionIndex ) {
		setConfirming( null );
		removeButtonRefs.current[ `condition-${ ruleIndex }-${ conditionIndex }` ]?.focus();
	}

	function handleRemoveCondition( ruleIndex, conditionIndex ) {
		setConfirming( null );
		dispatch( removeCondition( ruleIndex, conditionIndex ) );
		addConditionButtonRefs.current[ ruleIndex ]?.focus();
	}

	return (
		<section className="quoteform_panel" aria-labelledby="quoteform_rules-heading">
			<div className="quoteform_panel__head">
				<div>
					<h2 id="quoteform_rules-heading">{ __( 'Rules', 'quoteform' ) }</h2>
					<p className="quoteform_panel__intro">
						{ __( 'Show or hide a field or a whole step.', 'quoteform' ) }
					</p>
				</div>
				<Button ref={ addRuleButtonRef } onClick={ () => dispatch( addRule() ) }>
					{ __( 'Add rule', 'quoteform' ) }
				</Button>
			</div>

			{ rules.length === 0 && (
				<p className="quoteform_card quoteform_empty">
					{ __(
						'No rules yet. Add one to show or hide things conditionally.',
						'quoteform'
					) }
				</p>
			) }

			{ rules.map( ( rule, index ) => {
				const number = index + 1;
				const at = ( key ) => errorsFor( errorIndex, `rules.${ index }.${ key }` );
				const isStep = rule.target.kind === 'step';
				const targetOptions = isStep ? stepOptions : fieldOptions;
				const targetPlaceholder = isStep
					? __( 'Choose a step…', 'quoteform' )
					: __( 'Choose a field…', 'quoteform' );
				const availableActions = isStep
					? ACTIONS.filter( ( action ) => ! FIELD_ONLY_ACTIONS.includes( action ) )
					: ACTIONS;
				const actionOptions = toOptions( availableActions, ( action ) => ACTION_LABELS[ action ] );
				const selfReferencing =
					! isStep &&
					rule.target.key !== '' &&
					rule.conditions.some( ( condition ) => condition.field === rule.target.key );
				const ruleErrors = errorsFor( errorIndex, `rules.${ index }` );
				const targetErrors = at( 'target' );
				const conditionsErrors = at( 'conditions' );

				return (
					<div className="quoteform_rule quoteform_card" key={ index }>
						<FieldError id={ `quoteform_rule-${ index }-error` } errors={ ruleErrors } />

						<div className="quoteform_rule__sentence">
							<SelectControl
								id={ `quoteform_rule-${ index }-target-kind` }
								label={ sprintf(
									/* translators: %d: rule number. */
									__( 'Rule %d target kind', 'quoteform' ),
									number
								) }
								hideLabel
								value={ rule.target.kind }
								onChange={ ( value ) =>
									dispatch( updateRule( index, { target: { kind: value, key: '' } } ) )
								}
								options={ TARGET_KINDS }
								errors={ at( 'target.kind' ) }
							/>

							<FieldError id={ `quoteform_rule-${ index }-target-error` } errors={ targetErrors } />

							<SelectControl
								id={ `quoteform_rule-${ index }-target` }
								label={ sprintf(
									/* translators: %d: rule number. */
									__( 'Rule %d target', 'quoteform' ),
									number
								) }
								hideLabel
								value={ rule.target.key }
								onChange={ ( value ) =>
									dispatch(
										updateRule( index, { target: { kind: rule.target.kind, key: value } } )
									)
								}
								options={ targetOptions }
								placeholder={ targetPlaceholder }
								errors={ at( 'target.key' ) }
							/>

							<span className="quoteform_rule__word" aria-hidden="true">
								{ isRTL() ? '←' : '→' }
							</span>

							<SelectControl
								id={ `quoteform_rule-${ index }-action` }
								label={ sprintf(
									/* translators: %d: rule number. */
									__( 'Rule %d action', 'quoteform' ),
									number
								) }
								hideLabel
								value={ rule.action }
								onChange={ ( value ) => dispatch( updateRule( index, { action: value } ) ) }
								options={ actionOptions }
								errors={ at( 'action' ) }
							/>

							<span className="quoteform_rule__word" aria-hidden="true">
								{
									/* translators: connector word in a rule sentence, before "All/Any condition(s) must match". */
									_x( 'when', 'rule sentence connector', 'quoteform' )
								}
							</span>

							<SelectControl
								id={ `quoteform_rule-${ index }-match` }
								label={ sprintf(
									/* translators: %d: rule number. */
									__( 'Rule %d match', 'quoteform' ),
									number
								) }
								hideLabel
								value={ rule.match }
								onChange={ ( value ) => dispatch( updateRule( index, { match: value } ) ) }
								options={ MATCH_MODES }
								errors={ at( 'match' ) }
							/>
						</div>

						{ selfReferencing && (
							<p className="quoteform_warning">
								{ __( 'A rule cannot test the same field it changes.', 'quoteform' ) }
							</p>
						) }

						<FieldError id={ `quoteform_rule-${ index }-conditions-error` } errors={ conditionsErrors } />

						{ rule.conditions.map( ( condition, conditionIndex ) => (
							<RuleConditionRow
								key={ conditionIndex }
								ruleIndex={ index }
								ruleNumber={ number }
								conditionIndex={ conditionIndex }
								condition={ condition }
								match={ rule.match }
								fieldOptions={ fieldOptions }
								rowErrors={ errorsFor(
									errorIndex,
									`rules.${ index }.conditions.${ conditionIndex }`
								) }
								fieldErrors={ errorsFor(
									errorIndex,
									`rules.${ index }.conditions.${ conditionIndex }.field`
								) }
								operatorErrors={ errorsFor(
									errorIndex,
									`rules.${ index }.conditions.${ conditionIndex }.operator`
								) }
								valueErrors={ errorsFor(
									errorIndex,
									`rules.${ index }.conditions.${ conditionIndex }.value`
								) }
								disableRemove={ rule.conditions.length === 1 }
								isConfirming={ isConfirmingCondition( index, conditionIndex ) }
								removeButtonRef={ ( node ) => {
									removeButtonRefs.current[ `condition-${ index }-${ conditionIndex }` ] = node;
								} }
								onFieldChange={ ( value ) =>
									dispatch( updateCondition( index, conditionIndex, { field: value } ) )
								}
								onOperatorChange={ ( value ) =>
									dispatch( updateCondition( index, conditionIndex, { operator: value } ) )
								}
								onValueChange={ ( value ) =>
									dispatch( updateCondition( index, conditionIndex, { value } ) )
								}
								onRequestRemove={ () =>
									setConfirming( { type: 'condition', ruleIndex: index, conditionIndex } )
								}
								onConfirmRemove={ () => handleRemoveCondition( index, conditionIndex ) }
								onCancelRemove={ () => handleCancelRemoveCondition( index, conditionIndex ) }
							/>
						) ) }

						<div className="quoteform_step__tools">
							<Button
								variant="ghost"
								ref={ ( node ) => {
									addConditionButtonRefs.current[ index ] = node;
								} }
								onClick={ () => dispatch( addCondition( index ) ) }
								aria-label={ sprintf(
									/* translators: %d: rule number. */
									__( 'Add condition to rule %d', 'quoteform' ),
									number
								) }
							>
								{ __( 'Add condition', 'quoteform' ) }
							</Button>

							<Button
								variant="danger"
								ref={ ( node ) => {
									removeButtonRefs.current[ `rule-${ index }` ] = node;
								} }
								onClick={ () => setConfirming( { type: 'rule', index } ) }
								aria-label={ sprintf(
									/* translators: %d: rule number. */
									__( 'Remove rule %d', 'quoteform' ),
									number
								) }
							>
								{ __( 'Remove rule', 'quoteform' ) }
							</Button>
						</div>

						{ isConfirmingRule( index ) && (
							<RemoveConfirm
								message={ sprintf(
									/* translators: %d: rule number. */
									__( 'Remove rule %d? This cannot be undone.', 'quoteform' ),
									number
								) }
								confirmLabel={ sprintf(
									/* translators: %d: rule number. */
									__( 'Yes, remove rule %d', 'quoteform' ),
									number
								) }
								cancelLabel={ sprintf(
									/* translators: %d: rule number. */
									__( 'Keep rule %d', 'quoteform' ),
									number
								) }
								onConfirm={ () => handleRemoveRule( index ) }
								onCancel={ () => handleCancelRemoveRule( index ) }
							/>
						) }
					</div>
				);
			} ) }
		</section>
	);
}
