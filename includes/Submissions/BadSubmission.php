<?php

declare(strict_types=1);

namespace Quoteform\Submissions;

/**
 * Brauzerin interfeysindən gələ bilməyən göndəriş (saxtalaşdırma): naməlum
 * variant, uzun mətn, yanlış tarix. REST onu 400 `qform_bad_request` edir.
 */
final class BadSubmission extends \RuntimeException
{
}
