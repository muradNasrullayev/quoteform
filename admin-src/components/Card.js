export default function Card( { className = '', children, ...rest } ) {
	return (
		<div className={ [ 'quoteform_card', className ].filter( Boolean ).join( ' ' ) } { ...rest }>
			{ children }
		</div>
	);
}
