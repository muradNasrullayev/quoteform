/**
 * `@wordpress/block-editor` də WordPress-dən gəlir. `useBlockProps()` real
 * həyatda blokun kök elementinə redaktorun öz atributlarını qaytarır;
 * burada verilən propları olduğu kimi qaytarmaq kifayətdir, çünki test
 * edilən şey komponentin MƏZMUNUDUR.
 */
module.exports = {
	useBlockProps( props ) {
		return { ...( props || {} ) };
	},
};
