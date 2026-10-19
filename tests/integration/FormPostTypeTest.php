<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Forms\FormPostType;
use Quoteform\Support\Activation;
use Quoteform\Support\Capabilities;
use WP_UnitTestCase;

final class FormPostTypeTest extends WP_UnitTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        FormPostType::register();
    }

    protected function tearDown(): void
    {
        Capabilities::revokeFromAllRoles();
        parent::tearDown();
    }

    public function testPostTypeIsRegistered(): void
    {
        $this->assertTrue( post_type_exists( 'quoteform' ) );
    }

    public function testPostTypeIsHiddenFromTheFrontEndAndTheDefaultUi(): void
    {
        $object = get_post_type_object( 'quoteform' );

        $this->assertFalse( $object->public );
        $this->assertFalse( $object->show_ui );
        $this->assertFalse( $object->publicly_queryable );
    }

    public function testPostTypeSupportsTitleAndRevisions(): void
    {
        $this->assertTrue( post_type_supports( 'quoteform', 'title' ) );
        $this->assertTrue( post_type_supports( 'quoteform', 'revisions' ) );
        $this->assertFalse( post_type_supports( 'quoteform', 'editor' ) );
    }

    public function testPostTypeUsesOurCapability(): void
    {
        $object = get_post_type_object( 'quoteform' );

        $this->assertSame( 'qform_manage_forms', $object->cap->edit_posts );
        $this->assertSame( 'qform_manage_forms', $object->cap->publish_posts );
    }

    public function testSchemaMetaKeyIsExposedAsAConstant(): void
    {
        $this->assertSame( '_qform_schema', FormPostType::META_SCHEMA );
    }

    public function testAFormCanBeCreatedAndReadBack(): void
    {
        $id = wp_insert_post(
            [
                'post_type'   => FormPostType::POST_TYPE,
                'post_title'  => 'Cleaning quote',
                'post_status' => 'publish',
            ]
        );

        $this->assertIsInt( $id );
        $this->assertGreaterThan( 0, $id );

        $post = get_post( $id );

        $this->assertSame( 'Cleaning quote', $post->post_title );

        $typeObject = get_post_type_object( $post->post_type );

        $this->assertNotNull( $typeObject );
        $this->assertSame( FormPostType::POST_TYPE, $typeObject->name );
    }

    public function testPerPostCapabilityChecksResolveToOurCapability(): void
    {
        Activation::activate();

        $administratorId = self::factory()->user->create( [ 'role' => 'administrator' ] );
        wp_set_current_user( $administratorId );

        $formId = wp_insert_post(
            [
                'post_type'   => FormPostType::POST_TYPE,
                'post_title'  => 'Cleaning quote',
                'post_status' => 'publish',
            ]
        );

        $this->assertTrue( current_user_can( 'edit_post', $formId ) );
        $this->assertTrue( current_user_can( 'delete_post', $formId ) );
        $this->assertTrue( current_user_can( 'read_post', $formId ) );

        $subscriberId = self::factory()->user->create( [ 'role' => 'subscriber' ] );
        wp_set_current_user( $subscriberId );

        $this->assertFalse( current_user_can( 'edit_post', $formId ) );
    }
}
