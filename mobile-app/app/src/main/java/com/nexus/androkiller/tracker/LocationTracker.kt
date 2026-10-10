package com.nexus.androkiller.tracker

import android.annotation.SuppressLint
import android.content.Context
import android.os.Looper
import android.util.Log
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.nexus.androkiller.model.LocationData
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

class LocationTracker(private val context: Context) {

    private val fusedLocationClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)

    private val statusProvider = DeviceStatusProvider(context)

    private val _locationFlow = MutableSharedFlow<LocationData>(extraBufferCapacity = 10)
    val locationFlow: SharedFlow<LocationData> = _locationFlow.asSharedFlow()

    private var isTracking = false
    private var locationCallback: LocationCallback? = null

    @SuppressLint("MissingPermission")
    fun startTracking(intervalSeconds: Long = 15L) {
        if (isTracking) {
            stopTracking()
        }

        if (!PermissionManager.hasLocationPermission(context)) {
            Log.w(TAG, "Location permission not granted. Cannot start tracking.")
            return
        }

        val intervalMillis = (intervalSeconds * 1000).coerceAtLeast(3000L)

        val locationRequest = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMillis)
            .setMinUpdateIntervalMillis(intervalMillis / 2)
            .setWaitForAccurateLocation(false)
            .build()

        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                for (location in result.locations) {
                    val (battery, charging) = statusProvider.getBatteryInfo()
                    val locationData = LocationData(
                        deviceId = statusProvider.getDeviceId(),
                        latitude = location.latitude,
                        longitude = location.longitude,
                        altitude = location.altitude,
                        accuracy = location.accuracy,
                        speed = location.speed,
                        bearing = location.bearing,
                        batteryLevel = battery,
                        isCharging = charging
                    )
                    Log.d(TAG, "Location acquired: lat=${location.latitude}, lng=${location.longitude}, acc=${location.accuracy}m")
                    _locationFlow.tryEmit(locationData)
                }
            }
        }

        try {
            fusedLocationClient.requestLocationUpdates(
                locationRequest,
                locationCallback!!,
                Looper.getMainLooper()
            )
            isTracking = true
            Log.i(TAG, "Fused location tracking started with interval: ${intervalSeconds}s")
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException starting location updates: ${e.message}")
        }
    }

    fun stopTracking() {
        locationCallback?.let {
            fusedLocationClient.removeLocationUpdates(it)
            locationCallback = null
        }
        isTracking = false
        Log.i(TAG, "Location tracking stopped.")
    }

    fun isTrackingActive(): Boolean = isTracking

    companion object {
        private const val TAG = "LocationTracker"
    }
}
