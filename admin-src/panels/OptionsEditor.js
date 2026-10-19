import { __, sprintf } from '@wordpress/i18n';

import MoveButtons from '../components/MoveButtons';
import NumberControl from '../components/NumberControl';
import TextControl from '../components/TextControl';
import { uniqueKey } from '../lib/keys';
import { moveDown, moveUp } from '../lib/reorder';
import { useMoveFocus } from '../lib/useMoveFocus';
import { errorsFor } from '../state/errors';

export default function OptionsEditor( { options, onChange, errorIndex, pathPrefix } ) {
	const safeOptions = Array.isArray( options ) ? options : [];
	const moveFocus = useMoveFocus();

	const patch = ( index, key, value ) =>
		onChange(
			safeOptions.map( ( option, i ) => ( i === index ? { ...option, [ key ]: value } : option ) )
		);

	function move( index, direction ) {
		moveFocus.follow( index, direction );

		onChange( direction === 'up' ? moveUp( safeOptions, index ) : moveDown( safeOptions, index ) );
	}

	return (
		<div className="quoteform_options">
			<h4>{ __( 'Options', 'quoteform' ) }</h4>

			{ safeOptions.map( ( option, index ) => {
				const number = index + 1;
				const at = ( key ) => errorsFor( errorIndex, `${ pathPrefix }.${ index }.${ key }` );

				return (
					<div className="quoteform_options__row" key={ index }>
						<TextControl
							id={ `quoteform_option-${ index }-label` }
							label={ sprintf(
								/* translators: %d: option number. */
								__( 'Option %d label', 'quoteform' ),
								number
							) }
							value={ option.label }
							onChange={ ( value ) => patch( index, 'label', value ) }
							errors={ at( 'label' ) }
						/>
						<TextControl
							id={ `quoteform_option-${ index }-value` }
							label={ sprintf(
								/* translators: %d: option number. */
								__( 'Option %d value', 'quoteform' ),
								number
							) }
							value={ option.value }
							onChange={ ( value ) => patch( index, 'value', value ) }
							errors={ at( 'value' ) }
						/>
						<NumberControl
							id={ `quoteform_option-${ index }-price` }
							label={ sprintf(
								/* translators: %d: option number. */
								__( 'Option %d price', 'quoteform' ),
								number
							) }
							value={ option.price }
							onChange={ ( value ) => patch( index, 'price', value === null ? 0 : value ) }
							errors={ at( 'price' ) }
						/>
						<MoveButtons
							label={ sprintf(
								/* translators: %d: option number. */
								__( 'option %d', 'quoteform' ),
								number
							) }
							onMoveUp={ () => move( index, 'up' ) }
							onMoveDown={ () => move( index, 'down' ) }
							canMoveUp={ index > 0 }
							canMoveDown={ index < safeOptions.length - 1 }
							{ ...moveFocus.refsFor( index ) }
						/>
						<button
							type="button"
							onClick={ () => onChange( safeOptions.filter( ( _, i ) => i !== index ) ) }
							disabled={ safeOptions.length === 1 }
							aria-label={ sprintf(
								/* translators: %d: option number. */
								__( 'Remove option %d', 'quoteform' ),
								number
							) }
						>
							{ __( 'Remove', 'quoteform' ) }
						</button>
					</div>
				);
			} ) }

			<button
				type="button"
				onClick={ () =>
					onChange( [
						...safeOptions,
						{
							label: '',
							value: uniqueKey(
								`option_${ safeOptions.length + 1 }`,
								safeOptions.map( ( option ) => option.value )
							),
							price: 0,
						},
					] )
				}
			>
				{ __( 'Add option', 'quoteform' ) }
			</button>
		</div>
	);
}
