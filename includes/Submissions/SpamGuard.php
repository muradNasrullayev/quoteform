<?php

declare(strict_types=1);

namespace Quoteform\Submissions;

/**
 * Honeypot + serverin imzaladığı ticket (yeni spec §4.2). Ticket
 * `{form_id}.{issued_at}.{hmac}`-dir; vaxtı SERVER yazır və imzalayır, yəni
 * brauzerin saatına etibar edilmir. Saat və açar kənardan gəlir (test üçün).
 */
final class SpamGuard
{
    public const MIN_SECONDS = 3;
    public const MAX_SECONDS = 86400;

    /** @var string */
    private $secret;

    /** @var callable(): int */
    private $clock;

    public function __construct( string $secret, callable $clock )
    {
        $this->secret = $secret;
        $this->clock  = $clock;
    }

    public static function fromWordPress(): self
    {
        return new self( wp_salt( 'nonce' ), 'time' );
    }

    public function issueTicket( int $formId ): string
    {
        $issuedAt = (int) ( $this->clock )();

        return $formId . '.' . $issuedAt . '.' . $this->sign( $formId, $issuedAt );
    }

    /**
     * @param mixed $honeypot
     * @param mixed $ticket
     */
    public function isSpam( int $formId, $honeypot, $ticket ): bool
    {
        if ( ! is_string( $honeypot ) || '' !== $honeypot ) {
            return true;
        }

        if ( ! is_string( $ticket ) ) {
            return true;
        }

        $parts = explode( '.', $ticket );

        if ( 3 !== count( $parts ) || ! ctype_digit( $parts[0] ) || ! ctype_digit( $parts[1] ) ) {
            return true;
        }

        $issuedAt = (int) $parts[1];

        if ( (int) $parts[0] !== $formId || ! hash_equals( $this->sign( $formId, $issuedAt ), $parts[2] ) ) {
            return true;
        }

        $age = (int) ( $this->clock )() - $issuedAt;

        return $age < self::MIN_SECONDS || $age > self::MAX_SECONDS;
    }

    private function sign( int $formId, int $issuedAt ): string
    {
        return hash_hmac( 'sha256', $formId . '|' . $issuedAt, $this->secret );
    }
}
