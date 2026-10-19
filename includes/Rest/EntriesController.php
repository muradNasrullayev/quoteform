<?php

declare(strict_types=1);

namespace Quoteform\Rest;

use Quoteform\Submissions\SubmissionService;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

final class EntriesController
{
    /** @var SubmissionService|null */
    private $service;

    public function __construct( ?SubmissionService $service = null )
    {
        $this->service = $service;
    }

    public function registerRoutes(): void
    {
        register_rest_route(
            'quoteform/v1',
            '/entries',
            [
                'methods'             => 'POST',
                'callback'            => [ $this, 'create' ],
                'permission_callback' => '__return_true',
                'args'                => [
                    'form_id' => [ 'type' => 'integer', 'required' => true, 'minimum' => 1 ],
                    'values'  => [ 'type' => 'object', 'default' => [] ],
                    'hp'      => [ 'type' => 'string', 'default' => '' ],
                    'ticket'  => [ 'type' => 'string', 'default' => '' ],
                    'nonce'   => [ 'type' => 'string', 'default' => '' ],
                ],
            ]
        );
    }

    /**
     * @return WP_REST_Response|WP_Error
     */
    public function create( WP_REST_Request $request )
    {
        if ( ! wp_verify_nonce( (string) $request['nonce'], SubmissionService::NONCE_ACTION ) ) {
            return new WP_Error( 'qform_expired', __( 'Your session expired. Please try again.', 'quoteform' ), [ 'status' => 403 ] );
        }

        $userId = get_current_user_id();

        if ( 0 === $userId ) {
            // REST cookie autentifikasiyası X-WP-Nonce header tələb edir, brauzer isə
            // onu qəsdən göndərmir (CSRF qorumasını artıq `qform_submit` nonce-u edir) —
            // ona görə WordPress giriş etmiş istifadəçini də burada user 0 göstərir.
            // Doğru user id-ni login cookie-dən özümüz bərpa edirik.
            $userId = (int) wp_validate_auth_cookie( '', 'logged_in' );
        }

        $service = $this->service ?? new SubmissionService();
        $result  = $service->submit(
            [
                'form_id' => (int) $request['form_id'],
                'values'  => $request['values'],
                'hp'      => $request['hp'],
                'ticket'  => $request['ticket'],
            ],
            [
                'user_id'    => $userId,
                'ip'         => isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : null,
                'user_agent' => isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '',
            ]
        );

        return new WP_REST_Response( $result['body'], $result['status'] );
    }
}
