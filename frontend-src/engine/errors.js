export class ExpressionError extends Error {
	constructor( codeSlug, message, position = 0, context = {} ) {
		super( message );

		this.name = 'ExpressionError';
		this.codeSlug = codeSlug;
		this.position = position;
		this.context = context;
	}
}
