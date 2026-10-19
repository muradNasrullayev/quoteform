<?php

declare(strict_types=1);

namespace Quoteform\Rest;

use Quoteform\Submissions\SpamGuard;
use Quoteform\Submissions\SubmissionService;
use WP_REST_Request;
use WP_REST_Response;

/**
 * Nonce və ticket səhifəyə YAZILMIR (keşlənmiş səhifədə köhnələrdi) — brauzer
 * onları bu endpoint-dən alır. Cavab heç bir keşdə saxlanmamalıdır.
 */
final class SessionController
{
    public function registerRoutes(): void
    {
        register_rest_route(
            'quoteform/v1',
            '/session',
            [
                'methods'             => 'GET',
                'callback'            => [ $this, 'session' ],
                'permission_callback' => '__return_true',
                'args'                => [
                    'form_id' => [ 'type' => 'integer', 'required' => true, 'minimum' => 1 ],
                ],
            ]
        );
    }

    public function session( WP_REST_Request $request ): WP_REST_Response
    {
        $formId = (int) $request['form_id'];

        if ( ! SubmissionService::isPublishedForm( $formId ) ) {
            // WP_Error başlıq daşıya bilmir (`rest_convert_error_to_response()` yalnız
            // `status`-u error data-dan oxuyur), 404 cavabı isə eyni no-store başlığını
            // almalıdır — ona görə WP_Error-un istehsal edəcəyi JSON forması
            // (code/message/data) burada əllə təkrarlanır.
            $response = new WP_REST_Response(
                [
                    'code'    => 'qform_not_found',
                    'message' => __( 'This form is not available.', 'quoteform' ),
                    'data'    => [ 'status' => 404 ],
                ],
                404
            );

            $response->header( 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0' );

            return $response;
        }

        $response = new WP_REST_Response(
            [
                'nonce'  => wp_create_nonce( SubmissionService::NONCE_ACTION ),
                'ticket' => SpamGuard::fromWordPress()->issueTicket( $formId ),
            ]
        );

        $response->header( 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0' );

        return $response;
    }
}
