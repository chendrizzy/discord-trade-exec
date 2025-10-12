import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent } from './ui/dialog';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import {
  Home,
  Bot,
  BarChart3,
  Settings,
  Plus,
  Key,
  Search,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const commands = [
  {
    id: 'nav-overview',
    label: 'Go to Overview',
    icon: Home,
    category: 'Navigation',
    action: 'navigate',
    target: 'overview',
    keywords: ['home', 'dashboard'],
  },
  {
    id: 'nav-bots',
    label: 'Go to Bots',
    icon: Bot,
    category: 'Navigation',
    action: 'navigate',
    target: 'bots',
    keywords: ['trading', 'automation'],
  },
  {
    id: 'nav-analytics',
    label: 'Go to Analytics',
    icon: BarChart3,
    category: 'Navigation',
    action: 'navigate',
    target: 'analytics',
    keywords: ['charts', 'performance', 'metrics'],
  },
  {
    id: 'nav-settings',
    label: 'Go to Settings',
    icon: Settings,
    category: 'Navigation',
    action: 'navigate',
    target: 'settings',
    keywords: ['preferences', 'config'],
  },
  {
    id: 'action-create-bot',
    label: 'Create New Bot',
    icon: Plus,
    category: 'Actions',
    action: 'create-bot',
    keywords: ['add', 'new', 'trading'],
  },
  {
    id: 'action-api-keys',
    label: 'Manage API Keys',
    icon: Key,
    category: 'Actions',
    action: 'api-keys',
    keywords: ['exchange', 'connect'],
  },
];

export function CommandPalette({ open, onOpenChange, onNavigate, onAction }) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  // Filter commands based on search
  const filteredCommands = commands.filter((command) => {
    const searchLower = search.toLowerCase();
    return (
      command.label.toLowerCase().includes(searchLower) ||
      command.category.toLowerCase().includes(searchLower) ||
      command.keywords.some((keyword) => keyword.toLowerCase().includes(searchLower))
    );
  });

  // Group commands by category
  const groupedCommands = filteredCommands.reduce((acc, command) => {
    if (!acc[command.category]) {
      acc[command.category] = [];
    }
    acc[command.category].push(command);
    return acc;
  }, {});

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedIndex(0);
      // Focus input when opened
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!open) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          handleSelectCommand(filteredCommands[selectedIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, selectedIndex, filteredCommands]);

  const handleSelectCommand = (command) => {
    if (command.action === 'navigate') {
      onNavigate(command.target);
    } else {
      onAction(command.action);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0">
        <div className="border-b border-border">
          <div className="flex items-center px-4 py-3 gap-3">
            <Search className="h-5 w-5 text-muted-foreground" />
            <Input
              ref={inputRef}
              type="text"
              placeholder="Search commands..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedIndex(0);
              }}
              className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-base"
            />
            <Badge variant="outline" className="text-xs">
              <kbd className="font-mono">⌘K</kbd>
            </Badge>
          </div>
        </div>

        <div className="max-h-[400px] overflow-y-auto p-2">
          {Object.keys(groupedCommands).length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No commands found for "{search}"
            </div>
          ) : (
            Object.entries(groupedCommands).map(([category, categoryCommands]) => (
              <div key={category} className="mb-4">
                <div className="px-2 py-1.5">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase">
                    {category}
                  </h4>
                </div>
                <div className="space-y-1">
                  {categoryCommands.map((command, index) => {
                    const Icon = command.icon;
                    const globalIndex = filteredCommands.indexOf(command);
                    const isSelected = globalIndex === selectedIndex;

                    return (
                      <button
                        key={command.id}
                        onClick={() => handleSelectCommand(command)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                          isSelected
                            ? 'bg-gold-500/10 text-gold-500 border border-gold-500/20'
                            : 'text-foreground hover:bg-accent'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="flex-1 text-left">{command.label}</span>
                        {isSelected && (
                          <ArrowRight className="h-4 w-4 text-gold-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>
              <kbd className="px-1.5 py-0.5 bg-accent rounded font-mono">↑↓</kbd> Navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-accent rounded font-mono">Enter</kbd> Select
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-accent rounded font-mono">Esc</kbd> Close
            </span>
          </div>
          <span>{filteredCommands.length} commands</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
