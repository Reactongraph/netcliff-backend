# Google Play Subscription Integration Guide

## Overview
This document outlines the complete Google Play subscription integration for the premium plan system.

## Prerequisites

### 1. Google Play Console Setup
- Create a Google Play Developer account
- Set up your app in Google Play Console
- Configure subscription products with the same `productKey` as in your premium plans
- Enable Google Play Billing API

### 2. Service Account Setup
1. Go to Google Play Console → Setup → API access
2. Create a new service account
3. Download the JSON key file
4. Add the service account email to your app's license testing

### 3. Environment Variables
Add these to your `.env` file:
```env
GOOGLE_PLAY_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PLAY_KEY=your-private-key-content
```

## API Endpoints

### 1. Create Subscription History (with Google Play verification)
**POST** `/premiumPlan/createHistory`

**Request Body:**
```json
{
  "premiumPlanId": "plan_id_here",
  "paymentGateway": "GooglePlay",
  "purchaseToken": "google_play_purchase_token",
  "packageName": "com.yourapp.package",
  "orderId": "google_play_order_id"
}
```

**Response:**
```json
{
  "status": true,
  "message": "Success",
  "history": {
    "userId": "user_id",
    "premiumPlanId": "plan_id",
    "paymentGateway": "GooglePlay",
    "status": "active",
    "googlePlayPurchaseToken": "token_here",
    "googlePlayExpiryTime": "2024-12-31T23:59:59.000Z"
  }
}
```

### 2. Verify Google Play Purchase
**POST** `/premiumPlan/verifyGooglePlayPurchase`

**Request Body:**
```json
{
  "purchaseToken": "google_play_purchase_token",
  "productId": "your_product_id",
  "packageName": "com.yourapp.package"
}
```

### 3. Check Subscription Status
**POST** `/premiumPlan/checkGooglePlaySubscription`

**Request Body:**
```json
{
  "purchaseToken": "google_play_purchase_token"
}
```

### 4. Google Play Webhook
**POST** `/premiumPlan/googlePlayWebhook`

This endpoint receives server-side notifications from Google Play about subscription changes.

## Implementation Flow

### 1. Client-Side (Android App)
```kotlin
// 1. Initialize Google Play Billing
val billingClient = BillingClient.newBuilder(context)
    .setListener { billingResult, purchases ->
        // Handle purchase updates
    }
    .enablePendingPurchases()
    .build()

// 2. Query available subscriptions
billingClient.querySkuDetailsAsync(
    SkuDetailsParams.newBuilder()
        .setSkusList(listOf("premium_monthly", "premium_yearly"))
        .setType(BillingClient.SkuType.SUBS)
        .build()
) { billingResult, skuDetailsList ->
    // Display subscription options
}

// 3. Launch billing flow
val billingFlowParams = BillingFlowParams.newBuilder()
    .setSkuDetails(skuDetails)
    .build()
billingClient.launchBillingFlow(activity, billingFlowParams)

// 4. Handle purchase result
override fun onPurchasesUpdated(billingResult: BillingResult, purchases: List<Purchase>?) {
    if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
        purchases?.forEach { purchase ->
            // Send to your server for verification
            sendPurchaseToServer(purchase)
        }
    }
}

// 5. Send purchase to server
private fun sendPurchaseToServer(purchase: Purchase) {
    val requestBody = JSONObject().apply {
        put("premiumPlanId", getPlanIdFromSku(purchase.sku))
        put("paymentGateway", "GooglePlay")
        put("purchaseToken", purchase.purchaseToken)
        put("packageName", packageName)
        put("orderId", purchase.orderId)
    }
    
    // Make API call to /premiumPlan/createHistory
}
```

### 2. Server-Side Verification
The server automatically:
1. Verifies the purchase token with Google Play
2. Checks if the purchase is valid and not consumed
3. Prevents duplicate purchases
4. Updates user subscription status
5. Sends notifications

## Webhook Configuration

### 1. Google Play Console Setup
1. Go to Google Play Console → Monetization → Subscriptions
2. Click on your subscription product
3. Go to "Server-side notifications"
4. Add your webhook URL: `https://yourapi.com/premiumPlan/googlePlayWebhook`
5. Select notification types:
   - Purchase state changed
   - Subscription renewed
   - Subscription canceled
   - Subscription on hold
   - Subscription in grace period
   - Subscription restarted

### 2. Webhook Security
The webhook endpoint doesn't require authentication as it's called by Google's servers. However, you should:
- Verify the request comes from Google's IP ranges
- Implement rate limiting
- Log all webhook events for debugging

## Testing

### 1. Test Accounts
Add test accounts in Google Play Console:
1. Go to Setup → License testing
2. Add Gmail addresses of test users
3. These accounts can make test purchases without real money

### 2. Test Products
Create test subscription products:
- Use reserved product IDs (e.g., `android.test.purchased`)
- Set test prices (e.g., $0.01)
- Test all subscription states

### 3. Testing Flow
1. Install app on test device
2. Sign in with test account
3. Make test purchase
4. Verify server receives and processes the purchase
5. Test subscription cancellation
6. Test subscription renewal

## Error Handling

### Common Issues

1. **Invalid Purchase Token**
   - Token expired or already consumed
   - Wrong product ID or package name
   - Service account not configured properly

2. **Duplicate Purchase**
   - Same purchase token used multiple times
   - Check existing purchases before processing

3. **Verification Failed**
   - Google Play credentials incorrect
   - Network issues
   - API quota exceeded

### Error Responses
```json
{
  "status": false,
  "message": "Google Play verification failed: Invalid purchase token"
}
```

## Monitoring

### 1. Logs to Monitor
- Purchase verification attempts
- Webhook notifications received
- Subscription status changes
- Error responses from Google Play API

### 2. Metrics to Track
- Successful purchases vs failures
- Webhook delivery success rate
- Subscription renewal rates
- Cancellation rates

### 3. Alerts to Set
- High failure rate in purchase verification
- Webhook endpoint not responding
- Google Play API quota approaching limit

## Security Considerations

1. **Purchase Token Security**
   - Never expose purchase tokens in client logs
   - Store tokens securely in database
   - Validate tokens server-side only

2. **Service Account Security**
   - Keep service account key secure
   - Rotate keys regularly
   - Use least privilege principle

3. **Webhook Security**
   - Verify request origin
   - Implement rate limiting
   - Log all webhook events

## Troubleshooting

### 1. Purchase Not Being Processed
- Check if purchase token is valid
- Verify service account has correct permissions
- Check if product ID matches in Google Play Console

### 2. Webhook Not Receiving Notifications
- Verify webhook URL is correct and accessible
- Check if notifications are enabled in Google Play Console
- Monitor server logs for webhook requests

### 3. Subscription Status Not Updating
- Check webhook processing logic
- Verify user plan update logic
- Monitor database for status changes

## Best Practices

1. **Always verify purchases server-side**
2. **Handle all subscription states**
3. **Implement proper error handling**
4. **Log all transactions for debugging**
5. **Test thoroughly with test accounts**
6. **Monitor webhook delivery**
7. **Implement retry logic for failed verifications**
8. **Keep Google Play credentials secure**

## Support

For Google Play Billing issues:
- [Google Play Billing Documentation](https://developer.android.com/google/play/billing)
- [Google Play Console Help](https://support.google.com/googleplay/android-developer)
- [Google Play Billing API Reference](https://developer.android.com/reference/com/android/billingclient/api/BillingClient) 