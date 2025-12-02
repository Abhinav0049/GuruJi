import { useState, useMemo } from 'react';
import { Brain, Users, Heart, ChevronRight, Calendar, Building2, Share, FileDown, Eye, CheckCircle, Settings } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { ModuleSelector } from "./ModuleSelector";
import { SurveyCampaignSelector } from "./SurveyCampaignSelector";
import { SummaryBanner } from "./SummaryBanner";
import { ModuleSnapshot } from "./ModuleSnapshot";
import { PostSurveyResponsesPanel } from "./PostSurveyResponsesPanel";
import { PostSurveyResultsPanel } from "./PostSurveyResultsPanel";
import { ControlStrip } from "./ControlStrip";
import { ModuleConfig, SurveyCampaign } from "../types/survey";

interface PostSurveyDashboardProps {
  completedModule: string;
  onBackToDashboard: () => void;
  surveyResponses: Record<string, string>;
  mockData: any;
  isStandalone?: boolean;
  backendAggregates?: any;
}

export function PostSurveyDashboard({ 
  completedModule, 
  onBackToDashboard, 
  surveyResponses,
  mockData,
  backendAggregates,
  isStandalone = false
}: PostSurveyDashboardProps) {
  const [selectedModule, setSelectedModule] = useState(completedModule);
  const [selectedCampaign, setSelectedCampaign] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'responses' | 'results'>('results');

  const moduleConfigs: Record<string, ModuleConfig> = {
    'ai-readiness': {
      id: 'ai-readiness',
      name: 'AI Readiness',
      icon: <Brain className="h-5 w-5" />,
      color: 'text-blue-700',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200'
    },
    'leadership': {
      id: 'leadership',
      name: 'Leadership',
      icon: <Users className="h-5 w-5" />,
      color: 'text-green-700',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200'
    },
    'employee-experience': {
      id: 'employee-experience',
      name: 'Employee Experience',
      icon: <Heart className="h-5 w-5" />,
      color: 'text-purple-700',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200'
    }
  };

  // Mock survey campaigns data
  const surveyCampaigns: SurveyCampaign[] = useMemo(() => [
    {
      id: '1',
      title: 'AI Readiness Pulse Q4 2024',
      status: 'live',
      moduleId: 'ai-readiness',
      startDate: '2024-10-01',
      participantCount: 127,
      completionRate: 89,
      isActive: true
    },
    {
      id: '2',
      title: 'Leadership Assessment Q4 2024',
      status: 'live',
      moduleId: 'leadership',
      startDate: '2024-09-15',
      participantCount: 98,
      completionRate: 76,
      isActive: true
    },
    {
      id: '3',
      title: 'Employee Experience Survey Q4 2024',
      status: 'live',
      moduleId: 'employee-experience',
      startDate: '2024-09-20',
      participantCount: 156,
      completionRate: 82,
      isActive: true
    },
    {
      id: '4',
      title: 'Leadership Deep Dive Q3 2024',
      status: 'closed',
      moduleId: 'leadership',
      startDate: '2024-07-01',
      endDate: '2024-08-15',
      participantCount: 134,
      completionRate: 95,
      isActive: false
    }
  ], []);

  const currentModule = moduleConfigs[selectedModule];
  const currentCampaigns = surveyCampaigns.filter(c => c.moduleId === selectedModule);
  const activeCampaign = currentCampaigns.find(c => c.id === selectedCampaign) || currentCampaigns.find(c => c.isActive) || currentCampaigns[0];

  // Set initial campaign selection
  useMemo(() => {
    if (!selectedCampaign && activeCampaign) {
      setSelectedCampaign(activeCampaign.id);
    }
  }, [selectedModule, activeCampaign, selectedCampaign]);

  const completedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          {/* Breadcrumb - Hide in standalone */}
          {!isStandalone && (
            <nav className="flex items-center space-x-2 text-sm text-gray-600 mb-3">
              <button 
                onClick={onBackToDashboard}
                className="hover:text-gray-900 transition-colors"
              >
                Overview
              </button>
              <ChevronRight className="h-4 w-4" />
              <span className="text-gray-900">{currentModule.name}</span>
              <ChevronRight className="h-4 w-4" />
              <span className="text-gray-900">Post-Survey Summary</span>
            </nav>
          )}

          {/* Title Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${currentModule.bgColor} ${currentModule.borderColor} border`}>
                <div className={currentModule.color}>
                  {currentModule.icon}
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {isStandalone ? `${currentModule.name} Survey Results` : `Module Insights – ${currentModule.name}`}
                </h1>
                <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>Completed: {completedDate}</span>
                  </div>
                  {!isStandalone && (
                    <div className="flex items-center gap-1">
                      <Building2 className="h-4 w-4" />
                      <span>Company: Novatek Labs</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {!isStandalone && (
              <Button 
                variant="outline" 
                onClick={onBackToDashboard}
                className="gap-2"
              >
                <Eye className="h-4 w-4" />
                Back to Dashboard
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Survey Selector - Module switcher removed to show only completed module */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Show only the completed module */}
          <Card className="flex-1">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${currentModule.bgColor} ${currentModule.borderColor} border`}>
                  <div className={currentModule.color}>
                    {currentModule.icon}
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{currentModule.name}</h3>
                  <p className="text-sm text-gray-600">Survey completed on {completedDate}</p>
                </div>
                <Badge variant="outline" className="ml-auto bg-green-50 text-green-700 border-green-200">
                  Completed
                </Badge>
              </div>
            </CardContent>
          </Card>
          
          <SurveyCampaignSelector
            campaigns={currentCampaigns}
            selectedCampaign={selectedCampaign}
            onCampaignChange={setSelectedCampaign}
          />
        </div>

        {/* Summary Banner */}
        <SummaryBanner
          moduleName={currentModule.name}
          moduleColor={currentModule.color}
        />

        {/* Module Snapshot Metrics */}
            <ModuleSnapshot
              module={selectedModule}
              campaign={activeCampaign}
              surveyResponses={surveyResponses}
              mockData={mockData}
              serverSummary={backendAggregates?.[selectedModule]?.summaryMetrics}
            />

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'responses' | 'results')}>
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="responses">Demographics</TabsTrigger>
            <TabsTrigger value="results">Survey Results</TabsTrigger>
          </TabsList>

          <TabsContent value="responses" className="mt-6">
            <PostSurveyResponsesPanel
              module={selectedModule}
              campaign={activeCampaign}
              mockData={mockData}
            />
          </TabsContent>

          <TabsContent value="results" className="mt-6">
            <PostSurveyResultsPanel
              module={selectedModule}
              campaign={activeCampaign}
              surveyResponses={surveyResponses}
              mockData={mockData}
            />
          </TabsContent>
        </Tabs>

        {/* Control Strip - Hide in standalone */}
        {!isStandalone && (
          <ControlStrip
            campaign={activeCampaign}
            onCampaignUpdate={(updatedCampaign) => {
              // Handle campaign updates
              console.log('Campaign updated:', updatedCampaign);
            }}
          />
        )}
      </div>
    </div>
  );
}