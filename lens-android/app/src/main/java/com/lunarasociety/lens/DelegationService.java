package com.lunarasociety.lens;

import com.google.androidbrowserhelper.playbilling.digitalgoods.DigitalGoodsRequestHandler;

/**
 * Lets the web app inside the Trusted Web Activity reach Google Play
 * Billing through the Digital Goods API: prices, purchases, and the
 * list of what the member already owns. Purchases themselves go through
 * PaymentActivity (Payment Request API), declared in the manifest.
 */
public class DelegationService extends com.google.androidbrowserhelper.trusted.DelegationService {
    @Override
    public void onCreate() {
        super.onCreate();
        registerExtraCommandHandler(new DigitalGoodsRequestHandler(getApplicationContext()));
    }
}
