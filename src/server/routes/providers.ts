import { Router, Request, Response } from 'express';
import { ccSwitchAdapter } from '../services/ccswitch-adapter.js';
import { configStorage } from '../services/config-storage.js';
import { kilocodeService } from '../services/kilocode-service.js';

const router = Router();

/**
 * GET /api/providers
 * List all cc-switch providers
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const app = req.query.app as string | undefined;
    const result = await ccSwitchAdapter.listProviders(app);
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list providers';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

/**
 * POST /api/providers/switch
 * Switch to a different provider
 */
/**
 * POST /api/providers/add
 * Add a new provider
 */
router.post('/add', async (req: Request, res: Response) => {
  const { id, name, apiUrl, apiKey, app, websiteUrl, notes, sortIndex, model, models, haikuModel, sonnetModel, opusModel, providerType, usePromptCache } = req.body;

  if (!id || !name) {
    res.status(400).json({
      success: false,
      error: 'id and name are required',
    });
    return;
  }

  // Allow empty apiUrl for kilocode as it might not be applicable
  if (!apiUrl && app !== 'kilocode-cli') {
    res.status(400).json({
      success: false,
      error: 'apiUrl is required',
    });
    return;
  }

  try {
    const result = await ccSwitchAdapter.addProvider({
      id,
      name,
      apiUrl,
      apiKey,
      app,
      websiteUrl,
      notes,
      sortIndex,
      model,
      models,
      haikuModel,
      sonnetModel,
      opusModel,
      providerType,
      usePromptCache,
    });

    if (result.success) {
      res.json({
        success: true,
        data: result,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add provider';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

router.post('/switch', async (req: Request, res: Response) => {
  const { providerId, app } = req.body;

  if (!providerId) {
    res.status(400).json({
      success: false,
      error: 'providerId is required',
    });
    return;
  }

  try {
    const result = await ccSwitchAdapter.switchProvider(providerId, app);
    
    if (result.success) {
      res.json({
        success: true,
        data: result,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to switch provider';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

/**
 * GET /api/providers/current
 * Get the current active provider
 */
router.get('/current', async (req: Request, res: Response) => {
  try {
    const app = req.query.app as string | undefined;
    const appConfig = configStorage.getAppConfig();
    const providers = await ccSwitchAdapter.listProviders(app);
    const currentProvider = providers.providers.find(
      (p) => p.id === appConfig.settings.lastProviderId
    );

    res.json({
      success: true,
      data: {
        provider: currentProvider || null,
        providerId: appConfig.settings.lastProviderId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get current provider';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

/**
 * GET /api/providers/kilocode/config
 * Get raw kilocode config
 */
router.get('/kilocode/config', async (_req: Request, res: Response) => {
  try {
    const config = await kilocodeService.getRawConfig();
    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get kilocode config';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

/**
 * POST /api/providers/kilocode/config
 * Save raw kilocode config
 */
router.post('/kilocode/config', async (req: Request, res: Response) => {
  try {
    const { content } = req.body;
    if (typeof content !== 'string') {
      throw new Error('Content must be a string');
    }
    
    await kilocodeService.saveRawConfig(content);
    
    res.json({
      success: true,
      message: 'Configuration saved successfully',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save kilocode config';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

/**
 * GET /api/providers/:providerId
 * Get a single provider by ID with full configuration
 */
router.get('/:providerId', async (req: Request, res: Response) => {
  try {
    const { providerId } = req.params;
    const app = req.query.app as string | undefined;
    
    const provider = await ccSwitchAdapter.getProviderById(providerId, app);
    
    if (!provider) {
      res.status(404).json({
        success: false,
        error: `Provider '${providerId}' not found`,
      });
      return;
    }

    res.json({
      success: true,
      data: provider,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get provider';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

/**
 * POST /api/providers/edit
 * Edit an existing provider
 */
router.post('/edit', async (req: Request, res: Response) => {
  const { id, name, apiUrl, apiKey, app, websiteUrl, notes, sortIndex, model, models, haikuModel, sonnetModel, opusModel, providerType, usePromptCache } = req.body;

  if (!id) {
    res.status(400).json({
      success: false,
      error: 'id is required',
    });
    return;
  }

  try {
    const result = await ccSwitchAdapter.editProvider({
      id,
      name,
      apiUrl,
      apiKey,
      app,
      websiteUrl,
      notes,
      sortIndex,
      model,
      models,
      haikuModel,
      sonnetModel,
      opusModel,
      providerType,
      usePromptCache,
    });

    if (result.success) {
      res.json({
        success: true,
        data: result,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to edit provider';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

/**
 * POST /api/providers/duplicate
 * Duplicate a provider (optionally to a different app)
 */
router.post('/duplicate', async (req: Request, res: Response) => {
  const { providerId, newId, app, targetApp } = req.body;

  if (!providerId || !newId) {
    res.status(400).json({
      success: false,
      error: 'providerId and newId are required',
    });
    return;
  }

  try {
    const result = await ccSwitchAdapter.duplicateProvider(providerId, newId, app, targetApp);

    if (result.success) {
      res.json({
        success: true,
        data: result,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to duplicate provider';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

/**
 * POST /api/providers/speedtest
 * Run speedtest for a provider
 */
router.post('/speedtest', async (req: Request, res: Response) => {
  const { providerId, app } = req.body;

  if (!providerId) {
    res.status(400).json({
      success: false,
      error: 'providerId is required',
    });
    return;
  }

  try {
    const result = await ccSwitchAdapter.speedtestProvider(providerId, app);

    if (result.success) {
      res.json({
        success: true,
        data: result,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to speedtest provider';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

/**
 * DELETE /api/providers/:providerId
 * Delete a provider
 */
router.delete('/:providerId', async (req: Request, res: Response) => {
  const { providerId } = req.params;
  const app = req.query.app as string | undefined;

  try {
    const result = await ccSwitchAdapter.deleteProvider(providerId, app);

    if (result.success) {
      res.json({
        success: true,
        data: result,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete provider';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

export default router;
