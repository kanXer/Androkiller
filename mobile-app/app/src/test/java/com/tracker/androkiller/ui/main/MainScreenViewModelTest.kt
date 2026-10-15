package com.nexus.androkiller.ui.main

import junit.framework.TestCase.assertEquals
import junit.framework.TestCase.assertFalse
import kotlinx.coroutines.test.runTest
import org.junit.Test

class MainScreenViewModelTest {
  @Test
  fun uiState_initialState_isReady() = runTest {
    val viewModel = MainScreenViewModel()
    assertFalse(viewModel.uiState.value.isServiceRunning)
    assertEquals("Ready", viewModel.uiState.value.statusMessage)
    assertEquals(15L, viewModel.uiState.value.intervalSeconds)
  }
}
