<?php
/**
 * Sanitizes the optional HTML fragments injected via hooksHtml.
 *
 * @package WooCommerceSideCart
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class WCSC_HooksHtmlSanitizer {
	/**
	 * @var string[]
	 */
	private $allowedKeys = array( 'aboveItems', 'afterActions', 'afterFirstItem' );

	/**
	 * @param mixed  $policy Candidate policy.
	 * @param string $default Default policy.
	 * @return string post|strict|none
	 */
	public function validatePolicy( $policy, $default = 'post' ) {
		$policy = strtolower( trim( (string) $policy ) );
		if ( in_array( $policy, array( 'post', 'strict', 'none' ), true ) ) {
			return $policy;
		}
		return $default;
	}

	/**
	 * @param mixed $options Candidate options.
	 * @return array{enabled:bool,maxLength:int}
	 */
	public function normalizeOptions( $options ) {
		$enabled = true;
		$maxLength = 5000;

		if ( is_array( $options ) ) {
			if ( isset( $options['enabled'] ) ) {
				$enabled = (bool) $options['enabled'];
			}
			if ( isset( $options['maxLength'] ) ) {
				$maxLength = (int) $options['maxLength'];
			}
		}

		if ( $maxLength < 0 ) {
			$maxLength = 5000;
		}
		if ( $maxLength > 50000 ) {
			$maxLength = 50000;
		}

		return array(
			'enabled' => $enabled,
			'maxLength' => $maxLength,
		);
	}

	/**
	 * @param mixed  $hooksHtml Candidate hooksHtml array.
	 * @param string $policy Sanitization policy.
	 * @param mixed  $options hooksHtml options.
	 * @return array{aboveItems:string,afterActions:string,afterFirstItem:string}
	 */
	public function sanitizeMap( $hooksHtml, $policy, $options ) {
		$policy = $this->validatePolicy( $policy, 'post' );
		$options = $this->normalizeOptions( $options );

		$result = array(
			'aboveItems' => '',
			'afterActions' => '',
			'afterFirstItem' => '',
		);

		if ( ! $options['enabled'] || $policy === 'none' ) {
			return $result;
		}

		if ( ! is_array( $hooksHtml ) ) {
			$hooksHtml = array();
		}

		foreach ( $this->allowedKeys as $key ) {
			$value = isset( $hooksHtml[ $key ] ) ? $hooksHtml[ $key ] : '';
			$result[ $key ] = $this->sanitizeValue( $value, $policy, $options['maxLength'] );
		}

		return $result;
	}

	/**
	 * @param mixed  $value Candidate HTML string.
	 * @param string $policy Sanitization policy.
	 * @param int    $maxLength Max length in characters.
	 * @return string
	 */
	private function sanitizeValue( $value, $policy, $maxLength ) {
		$normalized = $this->normalizeValue( $value, $maxLength );
		if ( $normalized === '' ) {
			return '';
		}

		if ( $policy === 'strict' ) {
			$allowed = array(
				'a' => array(
					'href' => true,
					'target' => true,
					'rel' => true,
					'class' => true,
					'data-hook' => true,
					'aria-label' => true,
					'aria-hidden' => true,
					'aria-live' => true,
				),
				'div' => array(
					'class' => true,
					'data-hook' => true,
					'aria-label' => true,
					'aria-hidden' => true,
					'aria-live' => true,
				),
				'span' => array(
					'class' => true,
					'data-hook' => true,
					'aria-label' => true,
					'aria-hidden' => true,
					'aria-live' => true,
				),
				'p' => array(
					'class' => true,
					'data-hook' => true,
					'aria-label' => true,
					'aria-hidden' => true,
					'aria-live' => true,
				),
				'strong' => array(),
				'em' => array(),
				'br' => array(),
				'ul' => array(
					'class' => true,
					'data-hook' => true,
					'aria-label' => true,
					'aria-hidden' => true,
					'aria-live' => true,
				),
				'ol' => array(
					'class' => true,
					'data-hook' => true,
					'aria-label' => true,
					'aria-hidden' => true,
					'aria-live' => true,
				),
				'li' => array(
					'class' => true,
					'data-hook' => true,
					'aria-label' => true,
					'aria-hidden' => true,
					'aria-live' => true,
				),
				'small' => array(
					'class' => true,
					'data-hook' => true,
					'aria-label' => true,
					'aria-hidden' => true,
					'aria-live' => true,
				),
			);

			$sanitized = wp_kses( $normalized, $allowed );
		} else {
			// "post" policy: keep the WordPress post content allowlist.
			$sanitized = wp_kses_post( $normalized );
		}

		// Deterministic post-processing: normalize and clamp once more.
		$sanitized = $this->normalizeValue( $sanitized, $maxLength );

		return $sanitized;
	}

	/**
	 * Normalizes the input consistently before and after wp_kses.
	 *
	 * @param mixed $value Candidate value.
	 * @param int   $maxLength Max length in characters.
	 * @return string
	 */
	private function normalizeValue( $value, $maxLength ) {
		if ( ! is_string( $value ) ) {
			return '';
		}

		// Remove NUL bytes and normalize newlines to keep sanitization deterministic.
		$value = str_replace( "\0", '', $value );
		$value = str_replace( array( "\r\n", "\r" ), "\n", $value );
		$value = trim( $value );

		if ( $value === '' ) {
			return '';
		}

		if ( $maxLength === 0 ) {
			return '';
		}

		if ( $maxLength > 0 ) {
			if ( function_exists( 'mb_substr' ) ) {
				$value = mb_substr( $value, 0, $maxLength, 'UTF-8' );
			} else {
				$value = substr( $value, 0, $maxLength );
			}
		}

		return $value;
	}
}

