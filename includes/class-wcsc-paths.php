<?php
/**
 * Internal paths/urls resolver.
 *
 * @package WooCommerceSideCart
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class WCSC_Paths {
	/**
	 * @var string
	 */
	private $pluginFile;

	/**
	 * @param string $pluginFile Absolute plugin main file.
	 */
	public function __construct( $pluginFile ) {
		$this->pluginFile = (string) $pluginFile;
	}

	/**
	 * @return string
	 */
	public function pluginUrl() {
		return plugins_url( '', $this->pluginFile );
	}

	/**
	 * @return string
	 */
	public function pluginPath() {
		return untrailingslashit( plugin_dir_path( $this->pluginFile ) );
	}

	/**
	 * @param WC_Side_Cart $sideCart Side cart instance (for filters compatibility).
	 * @return string
	 */
	public function templatesPath( $sideCart ) {
		$templatePath = $this->pluginPath() . '/templates/';
		$templatePath = apply_filters( 'wc_side_cart_template_path', $templatePath, $sideCart );

		return trailingslashit( $templatePath );
	}
}

