<?php

declare(strict_types=1);

namespace Quoteform\Forms;

/**
 * Sxem validasiyasının xəta yığımı.
 *
 * Xətalar MESAJLA yox, KODLA identifikasiya olunur — mühərrikin öz konvensiyası ilə eyni.
 * Mesaj insanın oxuması üçündür və tərcümə olunur; builder isə koda və yola görə davranır.
 *
 * Yol nöqtə ilə ayrılır (`fields.room_count.min`) ki, builder xətanı düzgün
 * sahənin yanında göstərə bilsin.
 */
final class ValidationResult
{
    /** @var array<int, array{path: string, code: string, message: string, context: array<string, mixed>}> */
    private $errors = [];

    /**
     * @param array<string, mixed> $context
     */
    public function addError( string $path, string $code, string $message, array $context = [] ): void
    {
        $this->errors[] = [
            'path'    => $path,
            'code'    => $code,
            'message' => $message,
            'context' => $context,
        ];
    }

    public function isValid(): bool
    {
        return $this->errors === [];
    }

    public function errorCount(): int
    {
        return count( $this->errors );
    }

    /**
     * @return array<int, array{path: string, code: string, message: string, context: array<string, mixed>}>
     */
    public function getErrors(): array
    {
        return $this->errors;
    }

    public function merge( ValidationResult $other, string $pathPrefix = '' ): void
    {
        foreach ( $other->getErrors() as $error ) {
            if ( $pathPrefix !== '' ) {
                // Alt validator kolleksiyanın ÖZÜ haqqında xəta verə bilər (boş yol).
                // Belə halda prefiks tək başına düzgün yoldur — `calculations.` deyil, `calculations`.
                $error['path'] = $error['path'] === ''
                    ? $pathPrefix
                    : $pathPrefix . '.' . $error['path'];
            }

            $this->errors[] = $error;
        }
    }

    public function hasErrorAt( string $path ): bool
    {
        foreach ( $this->errors as $error ) {
            if ( $error['path'] === $path ) {
                return true;
            }
        }

        return false;
    }
}
