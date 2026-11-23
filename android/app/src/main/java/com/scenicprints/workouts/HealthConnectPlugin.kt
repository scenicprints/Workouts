package com.scenicprints.workouts

import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.LeanBodyMassRecord
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.Period
import java.time.ZoneId
import kotlin.reflect.KClass

/**
 * Thin bridge between the web app and Android Health Connect.
 * Reads body composition, daily activity and per-session vitals; writes finished strength sessions.
 */
@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val permissions: Set<String> = setOf(
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getReadPermission(BodyFatRecord::class),
        HealthPermission.getReadPermission(LeanBodyMassRecord::class),
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(RestingHeartRateRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(NutritionRecord::class),
        HealthPermission.getWritePermission(ExerciseSessionRecord::class),
    )

    private fun client(): HealthConnectClient = HealthConnectClient.getOrCreate(context)

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val status = HealthConnectClient.getSdkStatus(context)
        val ret = JSObject()
        ret.put("available", status == HealthConnectClient.SDK_AVAILABLE)
        ret.put(
            "status",
            when (status) {
                HealthConnectClient.SDK_AVAILABLE -> "available"
                HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update_required"
                else -> "unavailable"
            },
        )
        call.resolve(ret)
    }

    @PluginMethod
    fun hasPermissions(call: PluginCall) {
        scope.launch {
            try {
                val granted = client().permissionController.getGrantedPermissions()
                val ret = JSObject()
                ret.put("granted", granted.containsAll(permissions))
                ret.put("count", granted.size)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject(e.message ?: "Health Connect error")
            }
        }
    }

    @PluginMethod
    fun requestHealthPermissions(call: PluginCall) {
        try {
            val intent = PermissionController.createRequestPermissionResultContract().createIntent(context, permissions)
            startActivityForResult(call, intent, "onPermissionResult")
        } catch (e: Exception) {
            call.reject(e.message ?: "Could not open Health Connect")
        }
    }

    @ActivityCallback
    private fun onPermissionResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val granted = PermissionController.createRequestPermissionResultContract().parseResult(result.resultCode, result.data)
        val ret = JSObject()
        ret.put("granted", granted.containsAll(permissions))
        ret.put("count", granted.size)
        call.resolve(ret)
    }

    private suspend fun <T : Record> readAll(c: HealthConnectClient, type: KClass<T>, filter: TimeRangeFilter): List<T> {
        val out = mutableListOf<T>()
        var token: String? = null
        do {
            val resp = c.readRecords(ReadRecordsRequest(recordType = type, timeRangeFilter = filter, pageSize = 1000, pageToken = token))
            out.addAll(resp.records)
            token = resp.pageToken
        } while (token != null)
        return out
    }

    /** Weight, body fat and lean mass records since `since` (epoch ms). */
    @PluginMethod
    fun readBody(call: PluginCall) {
        val since = Instant.ofEpochMilli(call.getLong("since") ?: 0L)
        scope.launch {
            try {
                val c = client()
                val filter = TimeRangeFilter.between(since, Instant.now())
                val records = JSArray()
                for (r in readAll(c, WeightRecord::class, filter)) {
                    val o = JSObject()
                    o.put("type", "weight")
                    o.put("time", r.time.toEpochMilli())
                    o.put("value", r.weight.inKilograms)
                    records.put(o)
                }
                for (r in readAll(c, BodyFatRecord::class, filter)) {
                    val o = JSObject()
                    o.put("type", "fat")
                    o.put("time", r.time.toEpochMilli())
                    o.put("value", r.percentage.value)
                    records.put(o)
                }
                for (r in readAll(c, LeanBodyMassRecord::class, filter)) {
                    val o = JSObject()
                    o.put("type", "lean")
                    o.put("time", r.time.toEpochMilli())
                    o.put("value", r.mass.inKilograms)
                    records.put(o)
                }
                val ret = JSObject()
                ret.put("records", records)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject(e.message ?: "Health Connect read failed")
            }
        }
    }

    /** Daily steps, sleep minutes, resting heart rate and calories and protein eaten, one bucket per local day. */
    @PluginMethod
    fun readDaily(call: PluginCall) {
        val since = Instant.ofEpochMilli(call.getLong("since") ?: 0L)
        scope.launch {
            try {
                val c = client()
                val zone = ZoneId.systemDefault()
                val start = since.atZone(zone).toLocalDate().atStartOfDay()
                val end = LocalDate.now(zone).plusDays(1).atStartOfDay()
                val resp = c.aggregateGroupByPeriod(
                    AggregateGroupByPeriodRequest(
                        metrics = setOf(
                            StepsRecord.COUNT_TOTAL,
                            SleepSessionRecord.SLEEP_DURATION_TOTAL,
                            RestingHeartRateRecord.BPM_AVG,
                            NutritionRecord.ENERGY_TOTAL,
                            NutritionRecord.PROTEIN_TOTAL,
                        ),
                        timeRangeFilter = TimeRangeFilter.between(start, end),
                        timeRangeSlicer = Period.ofDays(1),
                    ),
                )
                val days = JSArray()
                for (bucket in resp) {
                    val o = JSObject()
                    o.put("date", bucket.startTime.atZone(zone).toInstant().toEpochMilli())
                    bucket.result[StepsRecord.COUNT_TOTAL]?.let { o.put("steps", it) }
                    bucket.result[SleepSessionRecord.SLEEP_DURATION_TOTAL]?.let { o.put("sleepMin", it.toMinutes()) }
                    bucket.result[RestingHeartRateRecord.BPM_AVG]?.let { o.put("restingHr", it) }
                    bucket.result[NutritionRecord.ENERGY_TOTAL]?.let { o.put("kcal", Math.round(it.inKilocalories)) }
                    bucket.result[NutritionRecord.PROTEIN_TOTAL]?.let { o.put("protein", Math.round(it.inGrams * 10) / 10.0) }
                    days.put(o)
                }
                val ret = JSObject()
                ret.put("days", days)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject(e.message ?: "Health Connect read failed")
            }
        }
    }

    /** Average and peak heart rate plus calories for a time window (epoch ms). */
    @PluginMethod
    fun readSessionVitals(call: PluginCall) {
        val start = Instant.ofEpochMilli(call.getLong("start") ?: 0L)
        val end = Instant.ofEpochMilli(call.getLong("end") ?: 0L)
        scope.launch {
            try {
                val r = client().aggregate(
                    AggregateRequest(
                        metrics = setOf(
                            HeartRateRecord.BPM_AVG,
                            HeartRateRecord.BPM_MAX,
                            ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL,
                            TotalCaloriesBurnedRecord.ENERGY_TOTAL,
                        ),
                        timeRangeFilter = TimeRangeFilter.between(start, end),
                    ),
                )
                val ret = JSObject()
                r[HeartRateRecord.BPM_AVG]?.let { ret.put("hrAvg", it) }
                r[HeartRateRecord.BPM_MAX]?.let { ret.put("hrMax", it) }
                val active = r[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories
                val total = r[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories
                (active ?: total)?.let { ret.put("calories", it) }
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject(e.message ?: "Health Connect read failed")
            }
        }
    }

    /** Write a finished strength session so it shows up in Fitbit and other Health Connect apps. */
    @PluginMethod
    fun writeSession(call: PluginCall) {
        val start = Instant.ofEpochMilli(call.getLong("start") ?: 0L)
        val end = Instant.ofEpochMilli(call.getLong("end") ?: 0L)
        val title = call.getString("title") ?: "Workout"
        val notes = call.getString("notes")
        scope.launch {
            try {
                val zone = ZoneId.systemDefault()
                val record = ExerciseSessionRecord(
                    startTime = start,
                    startZoneOffset = zone.rules.getOffset(start),
                    endTime = end,
                    endZoneOffset = zone.rules.getOffset(end),
                    exerciseType = ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING,
                    title = title,
                    notes = notes,
                    metadata = Metadata.manualEntry(),
                )
                val resp = client().insertRecords(listOf(record))
                val ret = JSObject()
                ret.put("id", resp.recordIdsList.firstOrNull() ?: "")
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject(e.message ?: "Health Connect write failed")
            }
        }
    }
}
