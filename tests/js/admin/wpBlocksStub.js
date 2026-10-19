/**
 * `@wordpress/blocks` WordPress-in özündən gəlir və bu checkout-da
 * quraşdırılmır (`wpElementStub.js` ilə eyni səbəb). Stub qeydiyyatı sadəcə
 * yadda saxlayır ki, test blokun HANSI adla və hansı parametrlərlə qeyd
 * olunduğunu yoxlaya bilsin.
 */
const registered = [];

module.exports = {
	registered,
	registerBlockType( name, settings ) {
		registered.push( { name, settings } );

		return settings;
	},
};
