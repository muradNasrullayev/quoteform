import { forwardRef } from '@wordpress/element';

/**
 * Builder-in yeganə düymə görünüşü. `ref` real `<button>`-a ötürülür:
 * ekranlar fokusu məhz bu ref-lərlə idarə edir (silmə təsdiqi, saxlama).
 */
const Button = forwardRef( function Button(
	{ variant = 'secondary', className = '', type = 'button', children, ...rest },
	ref
) {
	const classes = [ 'quoteform_button', `quoteform_button--${ variant }`, className ]
		.filter( Boolean )
		.join( ' ' );

	return (
		// eslint-disable-next-line react/button-has-type
		<button ref={ ref } type={ type } className={ classes } { ...rest }>
			{ children }
		</button>
	);
} );

export default Button;
