import { useState, useEffect } from 'react';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle, Circle } from 'lucide-react';
import { useWebSocketContext } from '../contexts/WebSocketContext';

/**
 * SignalQualityIndicator
 *
 * Displays signal quality tier with smart money indicators and confidence scoring
 * based on prediction market concepts (rare information, insider detection)
 * Now with real-time WebSocket updates!
 */
export function SignalQualityIndicator({ tradeId, compact = false }) {
  const [quality, setQuality] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const websocket = useWebSocketContext();

  useEffect(() => {
    if (!tradeId) {
      setLoading(false);
      return;
    }

    const fetchQuality = async () => {
      try {
        const response = await fetch(
          `/api/signals/${tradeId}/quality?includeProviderStats=false&includePositionSizing=false`
        );
        const data = await response.json();

        if (data.success) {
          setQuality(data.data);
        } else {
          setError(data.error || 'Failed to load quality');
        }
      } catch (err) {
        console.error('Failed to fetch signal quality:', err);
        setError('Failed to load');
      } finally {
        setLoading(false);
      }
    };

    fetchQuality();
  }, [tradeId]);

  // Subscribe to real-time signal quality updates
  useEffect(() => {
    if (!websocket || !tradeId) return;

    const handleQualityUpdate = (data) => {
      // Only update if this is for our trade
      if (data.tradeId === tradeId) {
        console.log('📡 Real-time quality update received:', data);
        setQuality(data);
        setLoading(false);
        setError(null);
      }
    };

    const unsubscribe = websocket.subscribe('signal:quality', handleQualityUpdate);
    console.log(`📡 SignalQualityIndicator subscribed for trade ${tradeId}`);

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [websocket, tradeId]);

  if (loading) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Circle className="h-3 w-3 animate-pulse" />
        {!compact && <span>Loading...</span>}
      </div>
    );
  }

  if (error || !quality) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <AlertCircle className="h-3 w-3" />
        {!compact && <span>N/A</span>}
      </div>
    );
  }

  const { quality: tier, smartMoney, rareInformation } = quality;

  // Quality tier styling
  const getTierVariant = (tierName) => {
    switch (tierName) {
      case 'ELITE':
        return 'default'; // Gold/primary styling
      case 'VERIFIED':
        return 'profit'; // Green styling
      case 'STANDARD':
        return 'outline'; // Gray styling
      default:
        return 'outline';
    }
  };

  const getTierColor = (tierName) => {
    switch (tierName) {
      case 'ELITE':
        return 'text-gold-400';
      case 'VERIFIED':
        return 'text-profit-text';
      case 'STANDARD':
        return 'text-muted-foreground';
      default:
        return 'text-muted-foreground';
    }
  };

  // Smart money indicator icons
  const smartMoneyIndicators = [
    {
      key: 'unusualTiming',
      active: smartMoney?.indicators?.unusualTiming,
      label: 'Unusual Timing',
      description: 'After-hours, pre-market, or near news events'
    },
    {
      key: 'highConviction',
      active: smartMoney?.indicators?.highConviction,
      label: 'High Conviction',
      description: 'Large position size with leverage'
    },
    {
      key: 'patternMatching',
      active: smartMoney?.indicators?.patternMatching,
      label: 'Pattern Matching',
      description: 'Matches historical winning patterns'
    },
    {
      key: 'insiderLikelihood',
      active: smartMoney?.indicators?.insiderLikelihood,
      label: 'Insider Likelihood',
      description: 'Corporate actions or regulatory filings'
    },
  ];

  const activeIndicators = smartMoneyIndicators.filter(i => i.active);

  // Compact view (for table cells)
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 cursor-help">
              <Badge variant={getTierVariant(tier.tier)} className="text-xs font-bold">
                {tier.symbol} {tier.tier}
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="w-80 p-4">
            <div className="space-y-3">
              {/* Quality Tier */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-2xl ${getTierColor(tier.tier)}`}>{tier.symbol}</span>
                  <span className="font-bold text-sm">{tier.tier}</span>
                </div>
                <p className="text-xs text-muted-foreground">{tier.description}</p>
              </div>

              {/* Confidence Score */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold">Confidence</span>
                  <span className="text-xs font-bold">{tier.confidence}%</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${tier.confidence >= 85 ? 'bg-gold-500' : tier.confidence >= 70 ? 'bg-profit' : 'bg-muted-foreground'}`}
                    style={{ width: `${tier.confidence}%` }}
                  />
                </div>
              </div>

              {/* Smart Money Score */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold">Smart Money</span>
                  <span className="text-xs font-bold">{smartMoney.score}/100</span>
                </div>
                <div className="grid grid-cols-2 gap-1 mt-2">
                  {smartMoneyIndicators.map((indicator) => (
                    <div
                      key={indicator.key}
                      className={`flex items-center gap-1 text-xs ${indicator.active ? 'text-profit-text' : 'text-muted-foreground'}`}
                    >
                      {indicator.active ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : (
                        <Circle className="h-3 w-3" />
                      )}
                      <span>{indicator.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rare Information */}
              {rareInformation && (
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-semibold">Rare Info</span>
                    <Badge
                      variant={rareInformation.level === 'HIGH' ? 'default' : rareInformation.level === 'MODERATE' ? 'profit' : 'outline'}
                      className="text-xs"
                    >
                      {rareInformation.level}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Score: {rareInformation.score}/100
                  </p>
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full view (for detailed panels)
  return (
    <div className="space-y-4">
      {/* Quality Tier Header */}
      <div className="flex items-center gap-3">
        <span className={`text-4xl ${getTierColor(tier.tier)}`}>{tier.symbol}</span>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold">{tier.tier}</h3>
            <Badge variant={getTierVariant(tier.tier)}>{tier.confidence}% Confidence</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{tier.description}</p>
        </div>
      </div>

      {/* Confidence Score */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold">Confidence Score</span>
          <span className="text-sm font-bold">{tier.confidence}%</span>
        </div>
        <div className="w-full bg-secondary rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${tier.confidence >= 85 ? 'bg-gold-500' : tier.confidence >= 70 ? 'bg-profit' : 'bg-muted-foreground'}`}
            style={{ width: `${tier.confidence}%` }}
          />
        </div>
      </div>

      {/* Smart Money Indicators */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold">Smart Money Indicators</span>
          <span className="text-sm font-bold">{smartMoney.score}/100</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {smartMoneyIndicators.map((indicator) => (
            <TooltipProvider key={indicator.key}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={`flex items-center gap-2 p-2 rounded-lg border ${indicator.active ? 'border-profit bg-profit/10' : 'border-border bg-secondary'} cursor-help`}
                  >
                    {indicator.active ? (
                      <CheckCircle className="h-4 w-4 text-profit-text" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-medium truncate ${indicator.active ? 'text-profit-text' : 'text-muted-foreground'}`}>
                        {indicator.label}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {smartMoney?.breakdown?.[indicator.key] || 0} pts
                      </div>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{indicator.description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>
      </div>

      {/* Rare Information Score */}
      {rareInformation && (
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold">Rare Information Detection</span>
            <Badge
              variant={rareInformation.level === 'HIGH' ? 'default' : rareInformation.level === 'MODERATE' ? 'profit' : 'outline'}
            >
              {rareInformation.level}
            </Badge>
          </div>
          <div className="w-full bg-secondary rounded-full h-2 mb-2">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${rareInformation.score >= 75 ? 'bg-gold-500' : rareInformation.score >= 50 ? 'bg-profit' : 'bg-muted-foreground'}`}
              style={{ width: `${rareInformation.score}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Score: {rareInformation.score}/100
          </p>
          {rareInformation.factors && rareInformation.factors.length > 0 && (
            <ul className="space-y-1">
              {rareInformation.factors.map((factor, idx) => (
                <li key={idx} className="text-xs text-muted-foreground flex items-start gap-1">
                  <TrendingUp className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>{factor}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
