import { useState } from 'react';
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ChevronDown, 
  FileText,
  BarChart3,
  Timer,
  Users
} from "lucide-react";

interface ModuleSurveyTabProps {
  module: {
    id: string;
    title: string;
    description: string;
    timeToComplete: string;
    totalQuestions: number;
    sections: Array<{
      name: string;
      questions: number;
      description?: string;
    }>;
  };
  status: 'not-started' | 'in-progress' | 'completed';
  progress: number;
  onStartSurvey: () => void;
  onResumeSurvey: () => void;
  onViewAnalysis: () => void;
  lastUpdated?: string;
}

export function ModuleSurveyTab({
  module,
  status,
  progress,
  onStartSurvey,
  onResumeSurvey,
  onViewAnalysis,
  lastUpdated
}: ModuleSurveyTabProps) {
  const [sectionsOpen, setSectionsOpen] = useState(false);

  const getStatusConfig = () => {
    switch (status) {
      case 'completed':
        return {
          icon: CheckCircle2,
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          label: 'Completed',
          description: 'Survey completed successfully'
        };
      case 'in-progress':
        return {
          icon: Clock,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
          label: 'In Progress',
          description: `${progress}% completed`
        };
      default:
        return {
          icon: AlertCircle,
          color: 'text-gray-500',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          label: 'Not Started',
          description: 'Ready to begin'
        };
    }
  };

  const statusConfig = getStatusConfig();
  const StatusIcon = statusConfig.icon;

  return (
    <div className="space-y-6">
      {/* Module Summary Card */}
      <Card className={`${statusConfig.bgColor} ${statusConfig.borderColor}`}>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl">{module.title}</CardTitle>
                <Badge 
                  variant="secondary" 
                  className={`${statusConfig.color} ${statusConfig.bgColor}`}
                >
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {statusConfig.label}
                </Badge>
              </div>
              <CardDescription className="text-base">
                {module.description}
              </CardDescription>
            </div>
          </div>

          {status === 'in-progress' && (
            <div className="space-y-2 mt-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Progress</span>
                <span className="font-medium">{progress}% complete</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Timer className="h-4 w-4" />
              <span>{module.timeToComplete} to complete</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <FileText className="h-4 w-4" />
              <span>{module.totalQuestions} questions total</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Users className="h-4 w-4" />
              <span>{module.sections.length} sections</span>
            </div>
          </div>

          {lastUpdated && (
            <p className="text-sm text-gray-500 mb-4">
              Last updated: {lastUpdated}
            </p>
          )}

          {/* Action Buttons (stack on small screens) */}
          <div className="flex flex-col sm:flex-row gap-3">
            {status === 'not-started' && (
              <Button onClick={onStartSurvey} size="lg" className="w-full sm:w-auto flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Start Survey
              </Button>
            )}
            
            {status === 'in-progress' && (
              <Button onClick={onResumeSurvey} size="lg" className="w-full sm:w-auto flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Resume Survey
              </Button>
            )}
            
            <Button 
              variant={status === 'completed' ? 'default' : 'outline'}
              onClick={onViewAnalysis}
              disabled={status === 'not-started'}
              size="lg"
              className="w-full sm:w-auto flex items-center gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              View Analysis
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Question Sections */}
      <Card>
        <CardHeader>
          <Collapsible open={sectionsOpen} onOpenChange={setSectionsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                <CardTitle className="text-lg">Survey Sections</CardTitle>
                <ChevronDown className={`h-4 w-4 transition-transform ${sectionsOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            
            <CollapsibleContent className="mt-4">
              <div className="space-y-3">
                {module.sections.map((section, index) => (
                  <div 
                    key={section.name}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center border text-sm font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">{section.name}</h4>
                        {section.description && (
                          <p className="text-sm text-gray-600">{section.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-gray-500">
                      {section.questions} questions
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardHeader>
      </Card>
    </div>
  );
}